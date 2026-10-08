import type { Database } from "../../database/index.ts";
import { enqueueJob } from "../jobs/queue.ts";
import type { JobContext, JobRegistry } from "../jobs/registry.ts";
import type { JobPayload } from "../jobs/schema.ts";

/**
 * Domain events on the durable job queue. `dispatch` runs inside the caller's write transaction
 * and enqueues one job per listener, so a rolled-back write dispatches nothing and a committed one
 * cannot lose its side effects. Each listener is its own job with its own retries: a failing
 * listener never blocks its siblings. Delivery is at-least-once, so listeners must be idempotent
 * (pass `idempotencyKey` to dispatch to also dedupe repeated dispatches of the same fact).
 *
 * Listeners are declared per feature and collected in `features/events.ts`.
 */

export type EventDefinition<T extends JobPayload> = { readonly name: string; readonly __payload?: T };

export type EventListener<T extends JobPayload = JobPayload> = {
  readonly name: string;
  readonly event: EventDefinition<T>;
  readonly queue: string;
  readonly maxAttempts: number | undefined;
  /** Stable job name `event.<event>.<listener>`; the registry key. */
  readonly jobName: string;
  readonly handler: (payload: T, context: JobContext) => Promise<void>;
};

/** Listener with its payload type erased, for registries that hold listeners of many events. */
export type AnyEventListener = Omit<EventListener, "handler" | "event"> & {
  readonly event: { readonly name: string };
  readonly handler: (payload: never, context: JobContext) => Promise<void>;
};

export type DispatchOptions = { idempotencyKey?: string; runAt?: Date };

export function defineEvent<T extends JobPayload>(name: string): EventDefinition<T> {
  if (!/^[a-z][a-z0-9_.-]{1,59}$/.test(name)) throw new Error("Event names must be stable lowercase identifiers");
  return { name };
}

export function defineListener<T extends JobPayload>(input: {
  name: string;
  event: EventDefinition<T>;
  handler: (payload: T, context: JobContext) => Promise<void>;
  queue?: string;
  maxAttempts?: number;
}): EventListener<T> {
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(input.name))
    throw new Error("Listener names must be stable lowercase identifiers");
  if (typeof input.handler !== "function") throw new TypeError("Listener handler must be a function");
  return {
    name: input.name,
    event: input.event,
    queue: input.queue ?? "default",
    maxAttempts: input.maxAttempts,
    jobName: `event.${input.event.name}.${input.name}`,
    handler: input.handler,
  };
}

export type EventBus = {
  /** Enqueues one job per listener of `event` using `db` (pass the transaction). Returns the job count. */
  dispatch<T extends JobPayload>(
    db: Database,
    event: EventDefinition<T>,
    payload: T,
    options?: DispatchOptions,
  ): Promise<number>;
  /** Registers every listener as a job handler; call once per registry at the composition root. */
  registerHandlers(registry: JobRegistry): void;
  readonly listeners: readonly AnyEventListener[];
};

export function createEventBus(listeners: readonly AnyEventListener[]): EventBus {
  const all = listeners;
  const seen = new Set<string>();
  for (const listener of all) {
    if (seen.has(listener.jobName)) throw new Error(`Duplicate event listener: ${listener.jobName}`);
    seen.add(listener.jobName);
  }
  return {
    listeners: all,
    async dispatch(db, event, payload, options = {}) {
      const matching = all.filter((listener) => listener.event.name === event.name);
      for (const listener of matching) {
        await enqueueJob(db, {
          name: listener.jobName,
          queue: listener.queue,
          payload,
          ...(listener.maxAttempts === undefined ? {} : { maxAttempts: listener.maxAttempts }),
          ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
          ...(options.runAt === undefined ? {} : { runAt: options.runAt }),
        });
      }
      return matching.length;
    },
    registerHandlers(registry) {
      for (const listener of all) {
        // The payload was validated by the dispatching side; the registry hands back the stored JSON.
        const handle = listener.handler as (payload: JobPayload, context: JobContext) => Promise<void>;
        registry.register(listener.jobName, handle);
      }
    },
  };
}

// The listener list is static configuration set once at boot (not data): a replica or isolate that
// registers the same list behaves identically, and the durable state lives in `background_jobs`.
let processBus: EventBus = createEventBus([]);

/** Runtime entrypoints call this once per process with the feature listeners. */
export function registerEventListeners(listeners: readonly AnyEventListener[]): EventBus {
  processBus = createEventBus(listeners);
  return processBus;
}

/** `dispatch(tx, event, payload)` against the listeners registered at boot. */
export function dispatch<T extends JobPayload>(
  db: Database,
  event: EventDefinition<T>,
  payload: T,
  options?: DispatchOptions,
): Promise<number> {
  return processBus.dispatch(db, event, payload, options);
}
