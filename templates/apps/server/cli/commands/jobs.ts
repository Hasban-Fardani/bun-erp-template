import { resolveRequired } from "@cli/lib/prompt.ts";
import { defineCommand } from "@cli/registry.ts";
import { sql } from "drizzle-orm";
import { rowsOf } from "../../database/rows.ts";
import { createJobRegistry, createSchedules } from "../../features/jobs.ts";
import { requeueDeadJob, runJobBatch } from "../../infra/jobs/queue.ts";
import { runDueSchedules, syncSchedules } from "../../infra/jobs/scheduler.ts";
import { startJobWorker } from "../../infra/jobs/worker.ts";
import { createCliContext } from "../lib/context.ts";

type ScheduleRow = {
  name: string;
  cron: string;
  timezone: string;
  nextRunAtMs: number;
  lastRunAtMs: number | null;
  lastStatus: string | null;
  lastError: string | null;
};

type ScheduleView = {
  name: string;
  cron: string;
  timezone: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
};

function formatScheduleTable(rows: ScheduleView[]): string {
  const header = ["NAME", "CRON", "TIMEZONE", "NEXT RUN", "LAST RUN", "STATUS", "LAST ERROR"];
  const cells = rows.map((row) => [
    row.name,
    row.cron,
    row.timezone,
    row.nextRunAt,
    row.lastRunAt ?? "-",
    row.lastStatus ?? "-",
    row.lastError ?? "-",
  ]);
  const widths = header.map((heading, index) =>
    Math.max(heading.length, ...cells.map((cell) => cell[index]?.length ?? 0)),
  );
  return [header, ...cells]
    .map((cell) =>
      cell
        .map((value, index) => value.padEnd(widths[index] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export const commands = [
  defineCommand("jobs:work", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const worker = startJobWorker({
      db: ctx.db,
      registry: createJobRegistry(ctx),
      schedules: createSchedules(ctx),
      logger: ctx.logger,
    });
    const stop = () => worker.stop();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    try {
      await worker.done;
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      await ctx.close();
    }
  }),

  defineCommand("jobs:run-once", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const processed = await runJobBatch(ctx.db, createJobRegistry(ctx), ctx.logger, { limit: 20 });
      process.stdout.write(`Processed ${processed} background job(s).\n`);
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("jobs:tick", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const schedules = createSchedules(ctx);
      if (schedules.length === 0) {
        process.stdout.write("No registered schedules; nothing to tick.\n");
        return;
      }
      const tick = await runDueSchedules(ctx.db, schedules, ctx.logger);
      if (!tick.acquired) {
        process.stdout.write("Another tick is in progress; skipped.\n");
        return;
      }
      if (tick.enqueued.length === 0) {
        process.stdout.write("No due schedules.\n");
        return;
      }
      process.stdout.write(`Enqueued ${tick.enqueued.length} schedule run(s):\n`);
      for (const entry of tick.enqueued) {
        process.stdout.write(`  ${entry.name}  job=${entry.jobId}  scheduledFor=${entry.scheduledFor.toISOString()}\n`);
      }
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("jobs:schedule", async (args) => {
    const json = args.includes("--json");
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      await syncSchedules(ctx.db, createSchedules(ctx));
      const rows = rowsOf<ScheduleRow>(
        await ctx.db.execute(sql`
          select name, cron, timezone,
            (extract(epoch from next_run_at) * 1000)::float8 as "nextRunAtMs",
            (extract(epoch from last_run_at) * 1000)::float8 as "lastRunAtMs",
            last_status as "lastStatus", last_error as "lastError"
          from job_schedules order by name
        `),
      ).map(
        (row): ScheduleView => ({
          name: row.name,
          cron: row.cron,
          timezone: row.timezone,
          nextRunAt: new Date(row.nextRunAtMs).toISOString(),
          lastRunAt: row.lastRunAtMs === null ? null : new Date(row.lastRunAtMs).toISOString(),
          lastStatus: row.lastStatus,
          lastError: row.lastError,
        }),
      );
      if (json) {
        process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
        return;
      }
      process.stdout.write(rows.length === 0 ? "No schedules registered.\n" : `${formatScheduleTable(rows)}\n`);
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("jobs:status", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const rows = rowsOf<{ status: string; count: string | number }>(
        await ctx.db.execute(
          sql`select status, count(*) as count from background_jobs group by status order by status`,
        ),
      );
      for (const row of rows) process.stdout.write(`${row.status.padEnd(12)} ${row.count}\n`);
      if (rows.length === 0) process.stdout.write("No background jobs.\n");
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("jobs:dead", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      const rows = rowsOf<{
        id: string;
        name: string;
        queue: string;
        attemptCount: number;
        lastErrorCode: string | null;
        updatedAt: Date;
      }>(
        await ctx.db.execute(sql`
        select id, job_name as name, queue_name as queue, attempt_count as "attemptCount",
          last_error_code as "lastErrorCode", updated_at as "updatedAt"
        from background_jobs where status = 'dead' order by updated_at desc limit 100
      `),
      );
      for (const row of rows) {
        process.stdout.write(
          `${row.id}  ${row.name}  ${row.queue}  attempts=${row.attemptCount}  ${row.lastErrorCode ?? "unknown"}\n`,
        );
      }
      if (rows.length === 0) process.stdout.write("No dead jobs.\n");
    } finally {
      await ctx.close();
    }
  }),

  defineCommand("jobs:retry", async (args) => {
    const id = resolveRequired(args[0], "Job ID");
    if (!id) {
      process.stderr.write("Usage: bun loom jobs:retry <job-id>\n");
      process.exit(1);
    }
    const ctx = await createCliContext({ migrateOnStart: false });
    try {
      if (!(await requeueDeadJob(ctx.db, id))) throw new Error("No dead job found with that ID.");
      ctx.logger.warn({ event: "jobs.operator_requeued", jobId: id });
      process.stdout.write(`Requeued ${id}.\n`);
    } finally {
      await ctx.close();
    }
  }),
];
