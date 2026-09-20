import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../config/index.ts";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

type Handle = { db: Database; close: () => Promise<void> };

/** PGlite hanya membuat direktori terdalam, bukan parent-nya (`.data/pglite`). */
function ensurePgliteDir(path: string): void {
  if (path === "memory://") return;
  mkdirSync(path, { recursive: true });
}

/**
 * Memilih driver sesuai `DATABASE_DRIVER`. Modul lain menerima objek `db` yang sama
 * dan tidak boleh tahu driver mana yang aktif (ADR-0010a) — dialek tetap Postgres,
 * jadi tidak ada dua set migration.
 */
export function createDatabase(env: Env): Handle {
  if (env.DATABASE_DRIVER === "pglite") {
    ensurePgliteDir(env.PGLITE_PATH);
    const client = new PGlite(env.PGLITE_PATH);
    return {
      db: drizzlePglite(client, { schema }) as unknown as Database,
      close: () => client.close(),
    };
  }

  const client = postgres(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    ssl: env.DATABASE_SSL_MODE === "disable" ? false : env.DATABASE_SSL_MODE,
    onnotice: () => {},
  });
  return {
    db: drizzlePostgres(client, { schema }) as unknown as Database,
    close: () => client.end(),
  };
}
