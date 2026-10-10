import { sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { rowsOf } from "../../database/rows.ts";
import type { Logger } from "../observability/logger.ts";
import { enqueueJob } from "./queue.ts";
import type { JobHandler } from "./registry.ts";

/**
 * Recurring jobs on the durable queue: features declare schedules with `defineSchedule`, the
 * `job_schedules` table holds their runtime state, and one tick enqueues the due ones.
 *
 * Cron is hand-rolled 5-field (minute hour day-of-month month day-of-week) evaluated on the
 * schedule's wall clock; no dependency and no names — `*`, lists, ranges and steps only.
 */

export type CronSpec = {
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly daysOfMonth: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  readonly daysOfWeek: ReadonlySet<number>;
  readonly dayOfMonthRestricted: boolean;
  readonly dayOfWeekRestricted: boolean;
};

export function parseCron(expression: string): CronSpec {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new RangeError(`Cron expression must have 5 fields, got ${fields.length}`);
  const [minuteField = "", hourField = "", dayField = "", monthField = "", weekField = ""] = fields;
  const minutes = parseField(minuteField, 0, 59, "minute");
  const hours = parseField(hourField, 0, 23, "hour");
  const daysOfMonth = parseField(dayField, 1, 31, "day of month");
  const months = parseField(monthField, 1, 12, "month");
  const daysOfWeek = parseField(weekField, 0, 7, "day of week", (value) => (value === 7 ? 0 : value));
  return {
    minutes: minutes.values,
    hours: hours.values,
    daysOfMonth: daysOfMonth.values,
    months: months.values,
    daysOfWeek: daysOfWeek.values,
    dayOfMonthRestricted: dayField !== "*",
    dayOfWeekRestricted: weekField !== "*",
  };
}

function parseField(
  field: string,
  min: number,
  max: number,
  label: string,
  normalize?: (value: number) => number,
): { values: ReadonlySet<number> } {
  const values = new Set<number>();
  for (const element of field.split(",")) {
    for (const value of parseElement(element, min, max, label)) {
      values.add(normalize ? normalize(value) : value);
    }
  }
  if (values.size === 0) throw new RangeError(`Cron ${label} field has no values`);
  return { values };
}

function parseElement(element: string, min: number, max: number, label: string): number[] {
  if (element.length === 0) throw new RangeError(`Cron ${label} field has an empty element`);
  const [base = "", stepText, extraStep] = element.split("/");
  if (extraStep !== undefined) throw new RangeError(`Cron ${label} element "${element}" has too many steps`);
  const step = stepText === undefined ? 1 : parseInteger(stepText, label, "step");
  if (step < 1) throw new RangeError(`Cron ${label} step must be at least 1`);

  if (base === "*") return stepRange(min, max, step);

  const [startText = "", endText, extraRange] = base.split("-");
  if (extraRange !== undefined) throw new RangeError(`Cron ${label} element "${element}" has too many ranges`);
  const start = parseInteger(startText, label, "value");
  const end = endText === undefined ? (stepText === undefined ? start : max) : parseInteger(endText, label, "value");
  if (start < min || start > max) throw new RangeError(`Cron ${label} value ${start} is outside ${min}-${max}`);
  if (end < min || end > max) throw new RangeError(`Cron ${label} value ${end} is outside ${min}-${max}`);
  if (start > end) throw new RangeError(`Cron ${label} range ${start}-${end} is reversed`);
  return stepRange(start, end, step);
}

function parseInteger(text: string, label: string, kind: string): number {
  if (!/^\d+$/.test(text)) throw new RangeError(`Cron ${label} ${kind} "${text}" must be a non-negative integer`);
  return Number.parseInt(text, 10);
}

function stepRange(start: number, end: number, step: number): number[] {
  const values: number[] = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
const MAX_SEARCH_DAYS = 366 * 5;

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timezone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new RangeError(`Unknown timezone: ${timezone}`);
  }
  formatters.set(timezone, formatter);
  return formatter;
}

function wallClockOf(instant: Date, timezone: string): WallClock {
  const parts = formatterFor(timezone).formatToParts(instant);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number.parseInt(part.value, 10);
  }
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

/** Wall-clock fields to a UTC instant; null when a DST transition skips that wall time. */
function zonedWallToUtc(wall: WallClock, timezone: string): Date | null {
  const target = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = wallClockOf(new Date(guess), timezone);
    const difference = target - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    if (difference === 0) break;
    guess += difference;
  }
  const result = new Date(guess);
  const check = wallClockOf(result, timezone);
  if (
    check.year !== wall.year ||
    check.month !== wall.month ||
    check.day !== wall.day ||
    check.hour !== wall.hour ||
    check.minute !== wall.minute
  ) {
    return null;
  }
  return result;
}

/** First matching wall-clock minute strictly after `from`, returned as a UTC instant. */
export function nextRunAt(cron: string, from: Date, timezone = "UTC"): Date {
  if (Number.isNaN(from.getTime())) throw new RangeError("from must be a valid Date");
  const spec = parseCron(cron);
  const start = wallClockOf(from, timezone);
  const startDay = Date.UTC(start.year, start.month - 1, start.day);
  for (let offset = 0; offset <= MAX_SEARCH_DAYS; offset += 1) {
    const day = new Date(startDay + offset * 86_400_000);
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth() + 1;
    const dayOfMonth = day.getUTCDate();
    if (!spec.months.has(month)) continue;
    if (!matchesDay(spec, year, month, dayOfMonth)) continue;
    const firstHour = offset === 0 ? start.hour : 0;
    for (let hour = firstHour; hour <= 23; hour += 1) {
      if (!spec.hours.has(hour)) continue;
      const firstMinute = offset === 0 && hour === start.hour ? start.minute : 0;
      for (let minute = firstMinute; minute <= 59; minute += 1) {
        if (!spec.minutes.has(minute)) continue;
        const candidate = zonedWallToUtc({ year, month, day: dayOfMonth, hour, minute }, timezone);
        if (candidate && candidate.getTime() > from.getTime()) return candidate;
      }
    }
  }
  throw new RangeError(`Cron expression "${cron}" has no run within ${MAX_SEARCH_DAYS} days`);
}

/** Vixie semantics: with both day fields restricted, either one matching is enough. */
function matchesDay(spec: CronSpec, year: number, month: number, dayOfMonth: number): boolean {
  const dayOfWeek = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
  const dayOfMonthMatch = spec.daysOfMonth.has(dayOfMonth);
  const dayOfWeekMatch = spec.daysOfWeek.has(dayOfWeek);
  if (spec.dayOfMonthRestricted && spec.dayOfWeekRestricted) return dayOfMonthMatch || dayOfWeekMatch;
  if (spec.dayOfMonthRestricted) return dayOfMonthMatch;
  if (spec.dayOfWeekRestricted) return dayOfWeekMatch;
  return true;
}

export const DEFAULT_SCHEDULE_TIMEZONE = "UTC";

export type ScheduleDefinition = {
  readonly name: string;
  readonly cron: string;
  readonly timezone: string;
  readonly handler: JobHandler;
};

/** Declares one recurring job; the handler runs as a normal job when the tick enqueues it. */
export function defineSchedule(input: {
  name: string;
  cron: string;
  timezone?: string;
  handler: JobHandler;
}): ScheduleDefinition {
  const name = input.name.trim();
  if (!/^[a-z][a-z0-9_.-]{1,119}$/.test(name)) throw new Error("Schedule names must be stable lowercase identifiers");
  const cron = input.cron.trim();
  parseCron(cron);
  const timezone = input.timezone?.trim() || DEFAULT_SCHEDULE_TIMEZONE;
  formatterFor(timezone);
  if (typeof input.handler !== "function") throw new TypeError("Schedule handler must be a function");
  return Object.freeze({ name, cron, timezone, handler: input.handler });
}

/** Upserts the code definitions so the table always carries their cron, timezone and next run. */
export async function syncSchedules(
  db: Database,
  schedules: readonly ScheduleDefinition[],
  options: { now?: Date } = {},
): Promise<void> {
  if (schedules.length === 0) return;
  const now = options.now ?? (await readDatabaseNow(db));
  for (const schedule of schedules) {
    const next = nextRunAt(schedule.cron, now, schedule.timezone);
    await db.execute(sql`
      insert into job_schedules (name, cron, timezone, next_run_at)
      values (${schedule.name}, ${schedule.cron}, ${schedule.timezone}, ${next.toISOString()})
      on conflict (name) do update set
        cron = excluded.cron,
        timezone = excluded.timezone,
        next_run_at = case
          when job_schedules.cron <> excluded.cron or job_schedules.timezone <> excluded.timezone
          then excluded.next_run_at
          else job_schedules.next_run_at
        end,
        updated_at = now()
    `);
  }
}

export type ScheduleEnqueue = {
  readonly name: string;
  readonly jobId: string;
  readonly scheduledFor: Date;
};

export type ScheduleTickResult = {
  /** false when another tick held the advisory lock or no schedule is registered. */
  readonly acquired: boolean;
  readonly enqueued: readonly ScheduleEnqueue[];
};

const DEFAULT_LOCK_SECONDS = 60;

/**
 * One leader-safe pass: inside a single transaction, take the advisory lock, sync the code
 * definitions, claim due rows and enqueue exactly one job each, then advance `next_run_at`.
 * Missed runs coalesce because the next run is computed from now, never from the stale one.
 */
export async function runDueSchedules(
  db: Database,
  schedules: readonly ScheduleDefinition[],
  logger: Logger,
  options: { now?: Date; lockSeconds?: number } = {},
): Promise<ScheduleTickResult> {
  if (schedules.length === 0) return { acquired: false, enqueued: [] };
  const lockSeconds = options.lockSeconds ?? DEFAULT_LOCK_SECONDS;

  return db.transaction(async (transaction) => {
    const tx = transaction;
    const acquired = rowsOf<{ locked: boolean }>(
      await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended('loom:job-schedules', 0)) as locked`),
    )[0]?.locked;
    if (!acquired) return { acquired: false, enqueued: [] };

    const now = options.now ?? (await readDatabaseNow(tx));
    await syncSchedules(tx, schedules, { now });
    const claimUntil = new Date(now.getTime() + lockSeconds * 1_000);
    // Only registered names are claimable: a removed schedule keeps its row but must not fire.
    const registeredNames = sql.join(
      schedules.map((schedule) => sql`${schedule.name}`),
      sql`, `,
    );
    const due = rowsOf<{ name: string; cron: string; timezone: string; scheduledForMs: number }>(
      await tx.execute(sql`
        with due as (
          select name from job_schedules
          where name in (${registeredNames})
            and next_run_at <= ${now.toISOString()}
            and (locked_until is null or locked_until <= ${now.toISOString()})
          order by next_run_at asc
          for update skip locked
        )
        update job_schedules as schedule
        set locked_until = ${claimUntil.toISOString()}, updated_at = now()
        from due
        where schedule.name = due.name
        returning schedule.name, schedule.cron, schedule.timezone,
          (extract(epoch from schedule.next_run_at) * 1000)::float8 as "scheduledForMs"
      `),
    );

    const enqueued: ScheduleEnqueue[] = [];
    for (const row of due) {
      const scheduledFor = new Date(row.scheduledForMs);
      const jobId = await enqueueJob(tx, {
        name: row.name,
        payload: { scheduledFor: scheduledFor.toISOString() },
        idempotencyKey: `schedule:${row.name}:${scheduledFor.toISOString()}`,
      });
      const next = nextRunAt(row.cron, now, row.timezone);
      await tx.execute(sql`
        update job_schedules
        set next_run_at = ${next.toISOString()}, last_run_at = ${now.toISOString()}, last_status = 'enqueued',
            last_error = null, locked_until = null, updated_at = now()
        where name = ${row.name}
      `);
      enqueued.push({ name: row.name, jobId, scheduledFor });
      logger.info({
        event: "jobs.schedule.enqueued",
        schedule: row.name,
        jobId,
        scheduledFor: scheduledFor.toISOString(),
      });
    }
    return { acquired: true, enqueued };
  });
}

async function readDatabaseNow(db: Database): Promise<Date> {
  // Raw `timestamptz` comes back as text through this driver; epoch milliseconds stay typed.
  const rows = rowsOf<{ ms: number }>(await db.execute(sql`select (extract(epoch from now()) * 1000)::float8 as ms`));
  const ms = Number(rows[0]?.ms);
  return Number.isFinite(ms) ? new Date(ms) : new Date();
}
