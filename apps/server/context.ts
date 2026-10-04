import type { Auth } from "./features/identity/auth.ts";
import type { Env } from "./platform/config/index.ts";
import type { Database } from "./platform/database/index.ts";
import type { Logger } from "./platform/observability/logger.ts";

export { resolveDefaultOrganizationId } from "./platform/database/organizations.ts";

/** Composition root. Organization lives outside context: migrations must run before its tables exist. */
export type AppContext = {
  env: Env;
  db: Database;
  logger: Logger;
  auth: Auth;
  close: () => Promise<void>;
};
