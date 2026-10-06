import type { Env } from "../config/index.ts";
import type { Database } from "./postgres.ts";
import { createPostgresDatabase } from "./postgres.ts";

export type { Database } from "./postgres.ts";

type Handle = { db: Database; close: () => Promise<void> };

/** The server has one PostgreSQL driver across local, test, Bun, and Cloudflare environments. */
export function createDatabase(env: Env): Handle {
  return createPostgresDatabase(env.DATABASE_URL, env.DATABASE_POOL_MAX);
}
