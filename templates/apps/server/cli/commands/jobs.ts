import { sql } from "drizzle-orm";
import { resolveRequired } from "../../../../cli/lib/prompt.ts";
import { defineCommand } from "../../../../cli/registry.ts";
import { rowsOf } from "../../database/migrate.ts";
import { createJobRegistry } from "../../features/jobs.ts";
import { requeueDeadJob, runJobBatch } from "../../infra/jobs/queue.ts";
import { startJobWorker } from "../../infra/jobs/worker.ts";
import { createCliContext } from "../lib/context.ts";

export const commands = [
  defineCommand("jobs:work", async () => {
    const ctx = await createCliContext({ migrateOnStart: false });
    const worker = startJobWorker({ db: ctx.db, registry: createJobRegistry(ctx), logger: ctx.logger });
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
      process.stderr.write("Usage: bun erp jobs:retry <job-id>\n");
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
