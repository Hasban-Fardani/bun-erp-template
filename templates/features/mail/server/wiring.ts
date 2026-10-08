import { createMailer, type MailEnqueue, type Mailer } from "@bun-erp/mail/server";
import * as z from "zod";
import type { Env } from "../../config/index.ts";
import type { Database } from "../../database/index.ts";
import { enqueueJob } from "../../infra/jobs/queue.ts";
import type { JobRegistry } from "../../infra/jobs/registry.ts";
import type { Logger } from "../../infra/observability/logger.ts";

/**
 * The database-backed queue writer: `ctx.mail.queue()` stores a `mail.send` job for the worker.
 * `queue` defaults to the shared `default` queue; tests pass a private one so no other file's
 * runner can claim their rows.
 */
export function createMailEnqueue(db: Database, queue?: string): MailEnqueue {
  return (input) =>
    enqueueJob(db, {
      queue,
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

/** The `mail.send` payload contract: a job row is untrusted input, so parse before the cast. */
const mailAddress = z.union([z.string(), z.object({ address: z.string(), name: z.string().optional() })]);
const mailPayload = z.object({
  to: z.union([mailAddress, z.array(mailAddress)]),
  cc: z.union([mailAddress, z.array(mailAddress)]).optional(),
  bcc: z.union([mailAddress, z.array(mailAddress)]).optional(),
  replyTo: mailAddress.optional(),
  subject: z.string().min(1).max(240),
  html: z.string().optional(),
  text: z.string().optional(),
  attachments: z
    .array(z.object({ filename: z.string().min(1), content: z.string(), contentType: z.string().optional() }))
    .optional(),
  from: mailAddress.optional(),
});

/** Registered at the runtime composition root so queued mail is actually delivered by the worker. */
export function registerMailJobs(registry: JobRegistry, mailer: Mailer): void {
  registry.register("mail.send", async (payload, context) => {
    const message = mailPayload.safeParse(payload);
    if (!message.success) throw invalidPayload();
    // The job id is stable across retries, so providers that dedupe sends never deliver twice.
    await mailer.send({ ...message.data, idempotencyKey: `mail.send:${context.jobId}` });
  });
}

function invalidPayload(): Error {
  const error = new Error("Invalid mail.send payload") as Error & { code: string };
  error.code = "MAIL_PAYLOAD_INVALID";
  return error;
}
