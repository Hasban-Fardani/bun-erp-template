import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { Database } from "./index.ts";

const MIGRATIONS_TABLE = `
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

/** SQL written by hand so it shows up in diffs; one file = one step, safe to repeat. */
export async function migrate(db: Database, dir: string): Promise<string[]> {
  await db.execute(sql.raw(MIGRATIONS_TABLE));

  const appliedRows = await db.execute<{ name: string }>(sql`select name from _migrations`);
  // Drizzle returns an array for node-postgres, but `{ rows }` for the PGlite driver.
  const applied = new Set(rowsOf<{ name: string }>(appliedRows).map((r) => r.name));

  const files = [...new Bun.Glob("*.sql").scanSync({ cwd: dir })].sort();
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await Bun.file(join(dir, file)).text();
    // One file = one transaction: a failed migration leaves no half-built schema.
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

/** Drizzle `execute()` returns an array (postgres-js) or `{ rows }` (pglite). */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Statements split on `;` at end of line — enough for this SQL template, not a full SQL parser. */
export function splitStatements(body: string): string[] {
  return body
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
