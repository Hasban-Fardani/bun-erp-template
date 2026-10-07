import { createUuid } from "@bun-erp/utils";
import { createJobRegistry, createSchedules } from "../features/jobs.ts";
import { createApp } from "../http/app.ts";
import { isApiPath } from "../http/routing.ts";
import { usingWorkerContext } from "../infra/cloudflare/lifecycle.ts";
import { runJobBatch, runJobById } from "../infra/jobs/queue.ts";
import { runDueSchedules } from "../infra/jobs/scheduler.ts";
import { createJobWakeUp } from "../infra/jobs/wake-up.ts";
import { createCloudflareContext, createCloudflareInfrastructure, type WorkerBindings } from "./cloudflare-context.ts";

/**
 * One invocation processes jobs while it stays inside this wall-clock budget and never above the
 * job cap. Cron sweeps and queue batches both use it; the rows stay in the database, so stopping
 * early only delays the remainder to the next sweep or to the queue's redelivery.
 */
const CLOUDFLARE_JOB_TIME_BUDGET_MS = 10_000;
const CLOUDFLARE_JOB_MAX_PER_INVOCATION = 10;

type JobQueueMessage = {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

type JobQueueBatch = {
  messages: readonly JobQueueMessage[];
};

export default {
  async fetch(
    request: Request,
    bindings: WorkerBindings,
    execution: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!isApiPath(path)) {
      return bindings.ASSETS ? bindings.ASSETS.fetch(request) : new Response("Not Found", { status: 404 });
    }
    try {
      return await usingWorkerContext(
        () => createCloudflareContext(bindings),
        async (context) => {
          // Feature writes enqueue inside their transaction; the wrapper signals after it commits.
          const wakeUp = createJobWakeUp({
            driver: context.env.JOBS_WAKEUP_DRIVER,
            binding: bindings.JOBS_QUEUE,
            logger: context.logger,
          });
          return createApp({ ...context, db: wakeUp.wrap(context.db) }).fetch(request);
        },
        execution,
      );
    } catch {
      const suppliedId = request.headers.get("X-Request-Id");
      const requestId = suppliedId && suppliedId.length <= 128 ? suppliedId : createUuid();
      return Response.json(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Service is temporarily unavailable" }, meta: { requestId } },
        { status: 503, headers: { "X-Request-Id": requestId } },
      );
    }
  },

  /** The cron sweeper: it runs due schedules and catches wake-up signals the queue never delivered. */
  async scheduled(
    _controller: { cron: string; scheduledTime: number },
    bindings: WorkerBindings,
    execution: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<void> {
    execution.waitUntil(
      (async () => {
        const context = createCloudflareInfrastructure(bindings);
        try {
          const tick = await runDueSchedules(context.db, createSchedules(context), context.logger);
          const count = await runJobBatch(context.db, createJobRegistry(context), context.logger, {
            limit: CLOUDFLARE_JOB_MAX_PER_INVOCATION,
            timeBudgetMs: CLOUDFLARE_JOB_TIME_BUDGET_MS,
          });
          context.logger.info({
            event: "jobs.schedule.completed",
            enqueued: tick.enqueued.length,
            processed: count,
          });
        } catch {
          context.logger.error({ event: "jobs.schedule.failed" });
        } finally {
          await context.close();
        }
      })(),
    );
  },

  /** Queue wake-up: each message names one job, and `runJobById` re-claims it atomically. */
  async queue(batch: JobQueueBatch, bindings: WorkerBindings): Promise<void> {
    const context = createCloudflareInfrastructure(bindings);
    const startedAt = Date.now();
    let processed = 0;
    try {
      const registry = createJobRegistry(context);
      for (const message of batch.messages) {
        if (processed >= CLOUDFLARE_JOB_MAX_PER_INVOCATION || Date.now() - startedAt >= CLOUDFLARE_JOB_TIME_BUDGET_MS) {
          // Left unacked on purpose: Cloudflare redelivers after the visibility timeout, and the
          // cron sweeper can pick the rows up first. A delayed signal never loses a job.
          break;
        }
        const jobId = readJobId(message.body);
        if (!jobId) {
          message.ack();
          continue;
        }
        try {
          await runJobById(context.db, registry, context.logger, jobId);
          message.ack();
          processed += 1;
        } catch {
          context.logger.error({ event: "jobs.queue.failed", jobId });
          message.retry({ delaySeconds: 30 });
        }
      }
      context.logger.info({
        event: "jobs.queue.completed",
        processed,
        received: batch.messages.length,
        elapsedMs: Date.now() - startedAt,
      });
    } finally {
      await context.close();
    }
  },
};

/** The message body is untrusted input: a signal is a job id or it is acknowledged and dropped. */
function readJobId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const jobId = (body as { jobId?: unknown }).jobId;
  return typeof jobId === "string" && jobId.length > 0 && jobId.length <= 128 ? jobId : null;
}
