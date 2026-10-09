import type { AppContext } from "../bootstrap/context.ts";
import { createCache } from "../infra/cache/index.ts";
import { createEventBus } from "../infra/events/index.ts";
import { BATCH_JOB_NAME, BatchHandlerRegistry, processJobBatch } from "../infra/jobs/batch.ts";
// @erp:mail
import { JobRegistry } from "../infra/jobs/registry.ts";
import { defineSchedule, type ScheduleDefinition } from "../infra/jobs/scheduler.ts";
import { createEventListeners } from "./events.ts";
import { pruneRetention, retentionOptionsFromEnv } from "./retention.ts";

/**
 * Feature composition root for handlers. Add feature jobs here without coupling platform code to
 * domains; `bun erp features:install mail` adds the `mail.send` handler.
 */
export function createJobRegistry(ctx: Pick<AppContext, "env" | "db" | "logger">): JobRegistry {
  const registry = new JobRegistry();
  // @erp:jobs
  const batches = createBatchHandlers(ctx);
  registry.register(BATCH_JOB_NAME, async (payload, context) => {
    const batchId = typeof payload.batchId === "string" ? payload.batchId : "";
    if (!batchId) throw new Error("Batch payload requires a batchId");
    await processJobBatch(context.db, batchId, batches, ctx.logger);
  });
  createEventBus(createEventListeners()).registerHandlers(registry);
  for (const schedule of createSchedules(ctx)) registry.register(schedule.name, schedule.handler);
  return registry;
}

/**
 * Feature composition root for batches: a feature that imports or bulk-processes rows registers
 * its handler here, and `batch.process` resolves it by the name stored on the batch row.
 * `bun erp features:install import-export` adds `registerImportExportBatchHandlers(batches, ctx)`.
 */
export function createBatchHandlers(_ctx: Pick<AppContext, "env" | "db" | "logger">): BatchHandlerRegistry {
  const handlers = new BatchHandlerRegistry();
  return handlers;
}

/**
 * Feature composition root for schedules: each `defineSchedule` pairs a job handler with a cron
 * expression, and the tick enqueues one job per due schedule. `retention.prune` always runs hourly; `CACHE_DRIVER=database` adds `cache.prune`.
 */
export function createSchedules(ctx: Pick<AppContext, "env" | "db" | "logger">): ScheduleDefinition[] {
  const schedules: ScheduleDefinition[] = [];
  // Only the database cache driver leaves rows behind; memory and KV expire entries themselves.
  if (ctx.env.CACHE_DRIVER === "database") {
    schedules.push(
      defineSchedule({
        name: "cache.prune",
        cron: "*/15 * * * *",
        handler: async (_payload, context) => {
          const removed = await createCache({ driver: "database", db: context.db }).prune();
          ctx.logger.info({ event: "cache.pruned", removed });
        },
      }),
    );
  }
  // Hourly keeps Hyperdrive/Workers Free query use low: 7 bounded deletes per run, 24 runs a day.
  schedules.push(
    defineSchedule({
      name: "retention.prune",
      cron: "17 * * * *",
      handler: async (_payload, context) => {
        const removed = await pruneRetention(context.db, retentionOptionsFromEnv(ctx.env));
        ctx.logger.info({ event: "retention.pruned", ...removed });
      },
    }),
  );
  return schedules;
}
