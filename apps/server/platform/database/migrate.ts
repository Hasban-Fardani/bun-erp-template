import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { Database } from "./index.ts";

const MIGRATIONS_TABLE = `
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

/** SQL manual supaya terlihat di diff; satu file = satu langkah, aman diulang. */
export async function migrate(db: Database, dir: string): Promise<string[]> {
  await db.execute(sql.raw(MIGRATIONS_TABLE));

  const appliedRows = await db.execute<{ name: string }>(sql`select name from _migrations`);
  // Drizzle mengembalikan array untuk node-postgres, tapi `{ rows }` untuk driver PGlite.
  const applied = new Set(rowsOf<{ name: string }>(appliedRows).map((r) => r.name));

  const files = [...new Bun.Glob("*.sql").scanSync({ cwd: dir })].sort();
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(join(dir, file), "utf8");
    // Satu file = satu transaksi: migrasi gagal tidak meninggalkan schema separuh jadi.
    await db.transaction(async (tx) => {
      for (const statement of splitStatements(body)) {
        await tx.execute(sql.raw(statement));
      }
      await tx.execute(sql`insert into _migrations (name) values (${file})`);
    });
    ran.push(file);
  }

  return ran;
}

/** Drizzle `execute()` mengembalikan array (postgres-js) atau `{ rows }` (pglite). */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Statement dipisah `;` di akhir baris — cukup untuk SQL template ini, bukan parser SQL penuh. */
export function splitStatements(body: string): string[] {
  return body
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
