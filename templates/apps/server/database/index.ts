import type { Env } from "../config/index.ts";
import type { Database } from "./postgres.ts";
import { createPostgresDatabase, type PostgresLogger } from "./postgres.ts";

export type { Database } from "./postgres.ts";

type Handle = { db: Database; close: () => Promise<void> };

/** The server has one PostgreSQL driver across local, test, Bun, and Cloudflare environments. */
export function createDatabase(env: Env, logger?: PostgresLogger, onQuery?: (sql: string) => void): Handle {
  return createPostgresDatabase(env.DATABASE_URL, env.DATABASE_POOL_MAX, true, {
    sslMode: env.DATABASE_SSL_MODE,
    logger,
    onQuery,
  });
}
