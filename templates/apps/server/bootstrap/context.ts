import type { Env } from "../config/index.ts";
import type { Database } from "../database/index.ts";
import type { Auth } from "../features/identity/auth.ts";
import type { Logger } from "../infra/observability/logger.ts";
import type { Storage } from "../infra/storage.ts";

export { resolveDefaultOrganizationId } from "../database/organizations.ts";

/**
 * Composition root. Organization lives outside context: migrations must run before its tables exist.
 * Mail is not part of the default context; `bun erp features:install mail` adds `mail: Mailer`
 * and builds it here.
 */
export type AppContext = {
  env: Env;
  db: Database;
  logger: Logger;
  auth: Auth;
  storage: Storage;
  close: () => Promise<void>;
};
