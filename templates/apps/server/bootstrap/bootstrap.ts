import type { Env } from "../config/index.ts";
import { loadEnv } from "../config/index.ts";
import { createDatabase } from "../database/index.ts";
import { migrate } from "../database/migrate.ts";
// @loom:mail
import { createEventListeners } from "../features/events.ts";
import { createAuth } from "../features/identity/auth.ts";
import { configurePermissionCache } from "../features/rbac/cache.ts";
import { createAi } from "../infra/ai/index.ts";
import { createCacheFromEnv } from "../infra/cache/from-env.ts";
import { registerEventListeners } from "../infra/events/index.ts";
import { createLogger } from "../infra/observability/logger.ts";
import { createQueryMeter } from "../infra/observability/query-meter.ts";
import { createStorage } from "../infra/storage.ts";
import type { AppContext } from "./context.ts";

export type BootstrapOptions = {
  env?: Env;
  /** Migrations are opt-in: callers that only read (CLI commands, tests) must not run DDL implicitly. */
  migrateOnStart?: boolean;
  migrationsDir?: string;
  /** Observes every SQL statement; used by query-budget tests. */
  onQuery?: (sql: string) => void;
};

const MIGRATIONS_DIR = `${import.meta.dir}/../database/migrations`;

export async function createContext(options: BootstrapOptions = {}): Promise<AppContext> {
  const env = options.env ?? loadEnv();
  const logger = createLogger(env);
  const queries = createQueryMeter();
  const { db, close } = createDatabase(env, logger, (sql) => {
    queries.record(sql);
    options.onQuery?.(sql);
  });
  registerEventListeners(createEventListeners());
  const cache = createCacheFromEnv({ env, db });
  configurePermissionCache({ enabled: env.PERMISSION_CACHE_ENABLED, cache });

  if (options.migrateOnStart === true) {
    const ran = await migrate(db, options.migrationsDir ?? MIGRATIONS_DIR);
    if (ran.length > 0) logger.info({ event: "database.migrated", migrations: ran });
  }

  const auth = createAuth(env, db);
  const storage = createStorage({ env });
  const ai = createAi({ env });

  return { env, db, logger, auth, ai, storage, cache, queries, close };
}
