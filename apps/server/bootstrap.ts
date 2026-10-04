import type { AppContext } from "./context.ts";
import { createAuth } from "./features/identity/auth.ts";
import type { Env } from "./platform/config/index.ts";
import { loadEnv } from "./platform/config/index.ts";
import { createDatabase } from "./platform/database/index.ts";
import { migrate } from "./platform/database/migrate.ts";
import { createLogger } from "./platform/observability/logger.ts";

export type BootstrapOptions = {
  env?: Env;
  /** `false` for commands that handle their own migrations. */
  migrateOnStart?: boolean;
  migrationsDir?: string;
};

const MIGRATIONS_DIR = `${import.meta.dir}/migrations`;

export async function createContext(options: BootstrapOptions = {}): Promise<AppContext> {
  const env = options.env ?? loadEnv();
  const logger = createLogger(env);
  const { db, close } = createDatabase(env);

  if (options.migrateOnStart !== false) {
    const ran = await migrate(db, options.migrationsDir ?? MIGRATIONS_DIR);
    if (ran.length > 0) logger.info({ event: "database.migrated", migrations: ran });
  }

  const auth = createAuth(env, db);

  return { env, db, logger, auth, close };
}
