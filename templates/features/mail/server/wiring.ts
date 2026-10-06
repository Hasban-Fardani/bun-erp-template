import { createMailer, type MailEnqueue, type Mailer, type MailMessage } from "@bun-erp/mail/server";
import type { Env } from "../../config/index.ts";
import type { Database } from "../../database/index.ts";
import { enqueueJob } from "../../infra/jobs/queue.ts";
import type { JobRegistry } from "../../infra/jobs/registry.ts";
import type { Logger } from "../../infra/observability/logger.ts";

/** The database-backed queue writer: `ctx.mail.queue()` stores a `mail.send` job for the worker. */
export function createMailEnqueue(db: Database): MailEnqueue {
  return (input) =>
    enqueueJob(db, {
      name: input.name,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      runAt: input.runAt,
    });
}

/** The composition root builds this once; features reach the mailer through `ctx.mail`. */
export function createAppMailer(env: Env, logger: Logger, db: Database): Mailer {
  return createMailer({ config: env, logger, enqueue: createMailEnqueue(db) });
}

/** Registered at the runtime composition root so queued mail is actually delivered by the worker. */
export function registerMailJobs(registry: JobRegistry, mailer: Mailer): void {
  registry.register("mail.send", async (payload) => {
    await mailer.send(payload as MailMessage);
  });
}
