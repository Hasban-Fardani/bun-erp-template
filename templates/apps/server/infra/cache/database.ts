import { sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { rowsOf } from "../../database/rows.ts";
import type { CacheDriver } from "./types.ts";

/**
 * Shared cache in PostgreSQL (`cache_entries`, migration 0014). Safe across replicas and Worker
 * isolates. Expiry uses the database clock so app clock drift cannot extend an entry; TTLs are
 * passed as integer milliseconds and turned into an interval in SQL.
 */
export function createDatabaseDriver(db: Database): CacheDriver {
  return {
    async get(key) {
      const rows = rowsOf<{ value: string }>(
        await db.execute(sql`select value from cache_entries where key = ${key} and expires_at > now()`),
      );
      return rows[0]?.value;
    },
    async set(key, value, ttlMs) {
      await db.execute(sql`
        insert into cache_entries (key, value, expires_at)
        values (${key}, ${value}, now() + (${ttlMs} * interval '1 millisecond'))
        on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at
      `);
    },
    async delete(key) {
      await db.execute(sql`delete from cache_entries where key = ${key}`);
    },
    async deletePrefix(prefix) {
      await db.execute(sql`delete from cache_entries where left(key, ${prefix.length}) = ${prefix}`);
    },
    async prune() {
      const rows = rowsOf<{ key: string }>(
        await db.execute(sql`delete from cache_entries where expires_at <= now() returning key`),
      );
      return rows.length;
    },
  };
}
