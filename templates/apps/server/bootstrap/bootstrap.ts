import type { Env } from "../config/index.ts";
import { loadEnv } from "../config/index.ts";
import { createDatabase } from "../database/index.ts";
import { migrate } from "../database/migrate.ts";
// @erp:mail
import { createEventListeners } from "../features/events.ts";
import { createAuth } from "../features/identity/auth.ts";
import { configurePermissionCache } from "../features/rbac/cache.ts";
import { createCacheFromEnv } from "../infra/cache/from-env.ts";
import { registerEventListeners } from "../infra/events/index.ts";
import { createLogger } from "../infra/observability/logger.ts";
import { createStorage } from "../infra/storage.ts";
import type { AppContext } from "./context.ts";

export type BootstrapOptions = {
  env?: Env;
  /** Migrations are opt-in: callers that only read (CLI commands, tests) must not run DDL implicitly. */
  migrateOnStart?: boolean;
  migrationsDir?: string;
};

const MIGRATIONS_DIR = `${import.meta.dir}/../database/migrations`;

export async function createContext(options: BootstrapOptions = {}): Promise<AppContext> {
  const env = options.env ?? loadEnv();
  const logger = createLogger(env);
  const { db, close } = createDatabase(env);
  registerEventListeners(createEventListeners());
  const cache = createCacheFromEnv({ env, db });
  configurePermissionCache({ enabled: env.PERMISSION_CACHE_ENABLED, cache });

  if (options.migrateOnStart === true) {
    const ran = await migrate(db, options.migrationsDir ?? MIGRATIONS_DIR);
    if (ran.length > 0) logger.info({ event: "database.migrated", migrations: ran });
  }

  const auth = createAuth(env, db);
  const storage = createStorage({ env });

  return { env, db, logger, auth, storage, cache, close };
}
