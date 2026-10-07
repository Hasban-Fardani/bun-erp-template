import { DriverRegistry } from "@bun-erp/utils";
import type { Database } from "../../database/index.ts";
import type { Logger } from "../observability/logger.ts";
import { trackWakeUpSignals } from "./queue.ts";

/** The database row is the outbox; the signal only names the job that became visible. */
export type JobWakeUpSignal = { jobId: string };

export type JobWakeUpDriver = {
  send(signal: JobWakeUpSignal): Promise<void>;
};

/** Structural Cloudflare Queue producer binding; the server catalog carries no workers-types dependency. */
export type JobQueueBinding = {
  send(message: JobWakeUpSignal): Promise<void>;
};

export type JobWakeUpContext = {
  /** `JOBS_QUEUE` producer binding, required by the `cloudflare-queue` driver. */
  binding?: JobQueueBinding | undefined;
};

/**
 * Driver registry for the wake-up signal. `none` is the default and the right choice on Bun: the
 * polling worker and the Cloudflare cron sweeper read the database, so no signal is needed.
 * `cloudflare-queue` sends one message per committed enqueue to the `JOBS_QUEUE` binding.
 */
export class JobWakeUpRegistry extends DriverRegistry<JobWakeUpContext, JobWakeUpDriver> {
  constructor() {
    super("job wake-up driver");
    this.register("none", () => ({ send: async () => {} }));
    this.register("cloudflare-queue", (context) => cloudflareQueueDriver(context.binding));
  }
}

export function createJobWakeUpRegistry(): JobWakeUpRegistry {
  return new JobWakeUpRegistry();
}

export type CreateJobWakeUpOptions = {
  /** `JOBS_WAKEUP_DRIVER`; an unknown name is a configuration error. */
  driver: string;
  /** The `JOBS_QUEUE` producer binding when the Worker declares one. */
  binding?: unknown;
  logger?: Pick<Logger, "warn">;
};

/**
 * Builds the wake-up handle for a composition root. A `cloudflare-queue` selection without its
 * binding falls back to `none` with a warning: an account without Queues keeps draining on cron.
 */
export function createJobWakeUp(options: CreateJobWakeUpOptions): JobWakeUp {
  const registry = createJobWakeUpRegistry();
  const driver = options.driver.trim().toLowerCase() || "none";
  if (driver === "cloudflare-queue" && !isQueueBinding(options.binding)) {
    options.logger?.warn({ event: "jobs.wake_up.binding_missing", driver });
    return new JobWakeUp(registry.create("none", {}), options.logger);
  }
  const context: JobWakeUpContext = isQueueBinding(options.binding) ? { binding: options.binding } : {};
  return new JobWakeUp(registry.create(driver, context), options.logger);
}

/**
 * Wakes the consumer after a feature write commits. `wrap(db)` proxies `transaction()`: every
 * `enqueueJob(tx, ...)` inside records the job id, and one signal per job is sent only once the
 * commit succeeds. A rolled-back write sends nothing. A send failure is logged and ignored —
 * the row is already committed, so a lost signal only delays the job to the next sweep.
 */
export class JobWakeUp {
  readonly #driver: JobWakeUpDriver;
  readonly #logger: Pick<Logger, "warn"> | undefined;

  constructor(driver: JobWakeUpDriver, logger?: Pick<Logger, "warn">) {
    this.#driver = driver;
    this.#logger = logger;
  }

  wrap(db: Database): JobWakeUpDatabase {
    const wakeUp = this;
    return new Proxy(db, {
      get(target, property, receiver) {
        if (property === "transaction") {
          return (write: (tx: Database) => Promise<unknown>, config?: DatabaseTransactionConfig) =>
            wakeUp.#transaction(target, write, config);
        }
        return Reflect.get(target, property, receiver);
      },
    }) as JobWakeUpDatabase;
  }

  async #transaction<T>(
    db: Database,
    write: (tx: Database) => Promise<T>,
    config?: DatabaseTransactionConfig,
  ): Promise<T> {
    const signals: JobWakeUpSignal[] = [];
    const result = await db.transaction(async (transaction) => {
      const tx = transaction as unknown as Database;
      trackWakeUpSignals(tx, signals);
      return write(tx);
    }, config);
    await this.#send(signals);
    return result;
  }

  async #send(signals: readonly JobWakeUpSignal[]): Promise<void> {
    for (const signal of signals) {
      try {
        await this.#driver.send(signal);
      } catch (error) {
        this.#logger?.warn({ event: "jobs.wake_up.failed", jobId: signal.jobId, errorCode: errorCode(error) });
      }
    }
  }
}

/** A database handle whose `transaction()` flushes wake-up signals after commit. */
export type JobWakeUpDatabase = Database & {
  transaction<T>(write: (tx: Database) => Promise<T>, config?: DatabaseTransactionConfig): Promise<T>;
};

type DatabaseTransactionConfig = Parameters<Database["transaction"]>[1];

function isQueueBinding(value: unknown): value is JobQueueBinding {
  return typeof value === "object" && value !== null && typeof (value as { send?: unknown }).send === "function";
}

function cloudflareQueueDriver(binding?: JobQueueBinding): JobWakeUpDriver {
  if (!binding) throw new Error("The cloudflare-queue job wake-up driver requires the JOBS_QUEUE binding");
  return { send: (signal) => binding.send(signal) };
}

function errorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.name) ? error.name : "JOB_WAKE_UP_FAILED";
}
