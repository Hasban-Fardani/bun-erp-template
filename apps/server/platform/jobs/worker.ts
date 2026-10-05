import type { Database } from "../database/index.ts";
import type { Logger } from "../observability/logger.ts";
import { runJobBatch } from "./queue.ts";
import type { JobRegistry } from "./registry.ts";

export type JobWorkerOptions = {
  db: Database;
  registry: JobRegistry;
  logger: Logger;
  batchSize?: number;
  pollIntervalMs?: number;
  errorBackoffMs?: number;
};

/** A stoppable polling loop shared by local development and the standalone Bun worker. */
export function startJobWorker(options: JobWorkerOptions): { stop: () => void; done: Promise<void> } {
  const batchSize = options.batchSize ?? 10;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const errorBackoffMs = options.errorBackoffMs ?? 2_000;
  let stopping = false;

  options.logger.info({ event: "jobs.worker.started", pollIntervalMs, batchSize });
  const done = poll()
    .catch((error: unknown) => {
      options.logger.error({ event: "jobs.worker.stopped_unexpectedly", errorCode: errorCode(error) });
      throw error;
    })
    .finally(() => options.logger.info({ event: "jobs.worker.stopped" }));

  return {
    stop: () => {
      stopping = true;
    },
    done,
  };

  async function poll(): Promise<void> {
    while (!stopping) {
      try {
        const processed = await runJobBatch(options.db, options.registry, options.logger, { limit: batchSize });
        if (processed === 0 && !stopping) await wait(pollIntervalMs);
      } catch (error) {
        options.logger.error({ event: "jobs.worker.poll_failed", errorCode: errorCode(error) });
        if (!stopping) await wait(errorBackoffMs);
      }
    }
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.name) ? error.name : "JOB_WORKER_FAILED";
}
