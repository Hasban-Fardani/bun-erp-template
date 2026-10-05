import type { Auth } from "./features/identity/auth.ts";
import type { Env } from "./platform/config/index.ts";
import type { Database } from "./platform/database/index.ts";
import type { Mailer } from "./platform/mail/index.ts";
import type { Logger } from "./platform/observability/logger.ts";
import type { Storage } from "./platform/storage.ts";

export { resolveDefaultOrganizationId } from "./platform/database/organizations.ts";

/** Composition root. Organization lives outside context: migrations must run before its tables exist. */
export type AppContext = {
  env: Env;
  db: Database;
  logger: Logger;
  auth: Auth;
  mail: Mailer;
  storage: Storage;
  close: () => Promise<void>;
};
