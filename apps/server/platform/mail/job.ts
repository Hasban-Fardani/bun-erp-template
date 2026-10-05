import type { JobRegistry } from "../jobs/registry.ts";
import type { Mailer, MailMessage } from "./types.ts";

/** Registered at the runtime composition root so queued mail is actually delivered by the worker. */
export function registerMailJobs(registry: JobRegistry, mailer: Mailer): void {
  registry.register("mail.send", async (payload) => {
    await mailer.send(payload as MailMessage);
  });
}
