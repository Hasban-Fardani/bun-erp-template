import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { Env } from "../config/index.ts";
import { createPostgresDatabase } from "./postgres.ts";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

type Handle = { db: Database; close: () => Promise<void> };

/**
 * PGlite creates only the deepest directory, not its parents, and Bun has no
 * `mkdir` API, so this shells out. `Bun.write` would create parents but also leaves a file.
 */
async function ensureDatabaseDir(path: string): Promise<void> {
  if (path === "memory://") return;
  await Bun.$`mkdir -p ${path}`.quiet();
}

/** The driver stays hidden here; other modules receive the same `db` (ADR-0010). */
export function createDatabase(env: Env): Handle {
  if (env.DATABASE_DRIVER === "pglite") {
    ensureDatabaseDir(env.DATABASE_PATH);
    const client = new PGlite(env.DATABASE_PATH);
    return {
      db: drizzlePglite(client, { schema }) as unknown as Database,
      close: () => client.close(),
    };
  }

  return createPostgresDatabase(env.DATABASE_URL, env.DATABASE_POOL_MAX);
}
