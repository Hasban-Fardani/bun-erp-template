import type { AppContext } from "../bootstrap/context.ts";
import { JobRegistry } from "../infra/jobs/registry.ts";

/**
 * Feature composition root for handlers. Add feature jobs here without coupling platform code to
 * domains; `bun erp features:install mail` adds the `mail.send` handler.
 */
export function createJobRegistry(_ctx: Pick<AppContext, "env" | "db" | "logger">): JobRegistry {
  const registry = new JobRegistry();
  return registry;
}
