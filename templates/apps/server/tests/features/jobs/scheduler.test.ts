import { expect, test } from "bun:test";
import { createUuid } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import type { Database } from "@/database/index.ts";
import { rowsOf } from "@/database/rows.ts";
import { defineSchedule, runDueSchedules, type ScheduleDefinition } from "@/infra/jobs/scheduler.ts";
import type { Logger } from "@/infra/observability/logger.ts";
import { createTestContext } from "../../support/fixtures.ts";

const noop = (): void => {};
const logger: Logger = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };

type ScheduleRow = {
  nextRunAtMs: number;
  lastRunAtMs: number | null;
  lastStatus: string | null;
};

async function scheduleRow(db: Database, name: string): Promise<ScheduleRow | undefined> {
  return rowsOf<ScheduleRow>(
    await db.execute(sql`
      select
        (extract(epoch from next_run_at) * 1000)::float8 as "nextRunAtMs",
        (extract(epoch from last_run_at) * 1000)::float8 as "lastRunAtMs",
        last_status as "lastStatus"
      from job_schedules where name = ${name}
    `),
  )[0];
}

async function enqueuedCount(db: Database, name: string): Promise<number> {
  const rows = rowsOf<{ count: string | number }>(
    await db.execute(sql`select count(*)::int as count from background_jobs where job_name = ${name}`),
  );
  return Number(rows[0]?.count ?? 0);
}

function schedule(name: string, cron = "0 0 1 1 *"): ScheduleDefinition {
  return defineSchedule({ name, cron, handler: async () => {} });
}

/** Registers one schedule through a tick so its row exists with the computed next run. */
async function registeredSchedule(db: Database, cron = "0 0 1 1 *"): Promise<ScheduleDefinition> {
  const definition = schedule(`tests.scheduler.${createUuid()}`, cron);
  await runDueSchedules(db, [definition], logger);
  return definition;
}

async function makeDue(db: Database, name: string, ago = "1 minute"): Promise<void> {
  await db.execute(sql`update job_schedules set next_run_at = now() - (${ago})::interval where name = ${name}`);
}

test("a tick registers schedules and enqueues exactly one job per due schedule", async () => {
  const { db } = await createTestContext();
  const due = schedule(`tests.scheduler.${createUuid()}`);
  const future = schedule(`tests.scheduler.${createUuid()}`);

  const first = await runDueSchedules(db, [due, future], logger);
  expect(first.acquired).toBe(true);
  expect(first.enqueued).toHaveLength(0);
  expect((await scheduleRow(db, due.name))?.nextRunAtMs ?? 0).toBeGreaterThan(Date.now());
  expect((await scheduleRow(db, future.name))?.nextRunAtMs ?? 0).toBeGreaterThan(Date.now());

  await makeDue(db, due.name);
  const second = await runDueSchedules(db, [due, future], logger);
  expect(second.enqueued).toHaveLength(1);
  expect(second.enqueued[0]?.name).toBe(due.name);
  expect(await enqueuedCount(db, due.name)).toBe(1);
  expect(await enqueuedCount(db, future.name)).toBe(0);

  const advanced = await scheduleRow(db, due.name);
  expect(advanced?.nextRunAtMs ?? 0).toBeGreaterThan(Date.now());
  expect(advanced?.lastRunAtMs).toBeTruthy();
  expect(advanced?.lastStatus).toBe("enqueued");

  const third = await runDueSchedules(db, [due, future], logger);
  expect(third.enqueued).toHaveLength(0);
  expect(await enqueuedCount(db, due.name)).toBe(1);
}, 30_000);

test("missed runs coalesce into one job and the next run stays in the future", async () => {
  const { db } = await createTestContext();
  const definition = await registeredSchedule(db);
  await makeDue(db, definition.name, "3 days");

  const tick = await runDueSchedules(db, [definition], logger);
  expect(tick.enqueued).toHaveLength(1);
  expect(await enqueuedCount(db, definition.name)).toBe(1);
  expect((await scheduleRow(db, definition.name))?.nextRunAtMs ?? 0).toBeGreaterThan(Date.now());
}, 30_000);

test("a locked schedule is skipped until the lock expires", async () => {
  const { db } = await createTestContext();
  const definition = await registeredSchedule(db);
  await db.execute(sql`
    update job_schedules set next_run_at = now() - interval '1 minute', locked_until = now() + interval '1 minute'
    where name = ${definition.name}
  `);

  const skipped = await runDueSchedules(db, [definition], logger);
  expect(skipped.enqueued).toHaveLength(0);
  expect(await enqueuedCount(db, definition.name)).toBe(0);

  await db.execute(
    sql`update job_schedules set locked_until = now() - interval '1 minute' where name = ${definition.name}`,
  );
  const claimed = await runDueSchedules(db, [definition], logger);
  expect(claimed.enqueued).toHaveLength(1);
  expect(await enqueuedCount(db, definition.name)).toBe(1);
}, 30_000);

test("concurrent ticks still enqueue one job per due schedule", async () => {
  const { db } = await createTestContext();
  const definition = await registeredSchedule(db);
  await makeDue(db, definition.name);

  const results = await Promise.all([
    runDueSchedules(db, [definition], logger),
    runDueSchedules(db, [definition], logger),
  ]);
  expect(results.reduce((total, result) => total + result.enqueued.length, 0)).toBe(1);
  expect(await enqueuedCount(db, definition.name)).toBe(1);
}, 30_000);

test("a row whose schedule is no longer registered is not claimed", async () => {
  const { db } = await createTestContext();
  const kept = await registeredSchedule(db);
  const removed = await registeredSchedule(db);
  await makeDue(db, kept.name);
  await makeDue(db, removed.name);

  const tick = await runDueSchedules(db, [kept], logger);
  expect(tick.enqueued).toHaveLength(1);
  expect(tick.enqueued[0]?.name).toBe(kept.name);
  expect(await enqueuedCount(db, removed.name)).toBe(0);
}, 30_000);

test("defineSchedule rejects invalid names, cron expressions and timezones", () => {
  const handler = async () => {};
  expect(() => defineSchedule({ name: "Bad Name", cron: "* * * * *", handler })).toThrow();
  expect(() => defineSchedule({ name: "tests.bad", cron: "not a cron", handler })).toThrow();
  expect(() => defineSchedule({ name: "tests.bad", cron: "* * * * *", timezone: "Nowhere/Land", handler })).toThrow();
  const accepted = defineSchedule({ name: "tests.good", cron: "0 8 * * 1-5", handler });
  expect(accepted.timezone).toBe("UTC");
  expect(accepted.cron).toBe("0 8 * * 1-5");
});
