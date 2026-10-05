import type { AppContext } from "../context.ts";
import { JobRegistry } from "../platform/jobs/registry.ts";
import { registerMailJobs } from "../platform/mail/index.ts";

/** Feature composition root for handlers. Add feature jobs here without coupling platform code to domains. */
export function createJobRegistry(ctx: Pick<AppContext, "env" | "db" | "logger" | "mail">): JobRegistry {
  const registry = new JobRegistry();
  registerMailJobs(registry, ctx.mail);
  return registry;
}
