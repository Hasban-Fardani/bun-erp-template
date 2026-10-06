import type { Database } from "../../database/index.ts";
import type { JobPayload } from "./schema.ts";

export type JobContext = { db: Database; jobId: string; attempt: number };
export type JobHandler<T extends JobPayload = JobPayload> = (payload: T, context: JobContext) => Promise<void>;

/** A job is executable only when its feature registers a handler at the runtime composition root. */
export class JobRegistry {
  readonly #handlers = new Map<string, JobHandler>();

  register(name: string, handler: JobHandler): void {
    if (!/^[a-z][a-z0-9_.-]{1,119}$/.test(name)) throw new Error("Job names must be stable lowercase identifiers");
    if (this.#handlers.has(name)) throw new Error(`Job handler already registered: ${name}`);
    this.#handlers.set(name, handler);
  }

  get(name: string): JobHandler | undefined {
    return this.#handlers.get(name);
  }
}
