// @erp:mail (installer anchor: `features:install mail` adds the Mailer import and context field)
import type { Env } from "../config/index.ts";
import type { Database } from "../database/index.ts";
import type { Auth } from "../features/identity/auth.ts";
import type { Cache } from "../infra/cache/index.ts";
import type { Logger } from "../infra/observability/logger.ts";
import type { Storage } from "../infra/storage.ts";

/**
 * Composition root. The default server has no tenant concept; an opt-in `organizations` feature
 * adds it later. Mail is not part of the default context; `bun erp features:install mail` adds
 * `mail: Mailer` and builds it here.
 */
export type AppContext = {
  env: Env;
  db: Database;
  logger: Logger;
  auth: Auth;
  storage: Storage;
  /** Cache facade; a cached value is an optimisation and never the source of truth. */
  cache: Cache;
  close: () => Promise<void>;
};
