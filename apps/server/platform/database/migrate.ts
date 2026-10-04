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

/** Dollar-quoted function bodies and quoted literals may contain their own semicolons. */
export function splitStatements(body: string): string[] {
  const tokens =
    /\$([a-zA-Z_][a-zA-Z_0-9]*|)\$[\s\S]*?\$\1\$|'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|;/g;
  const statements: string[] = [];
  let start = 0;
  for (const token of body.matchAll(tokens)) {
    if (token[0] !== ";") continue;
    const statement = body.slice(start, token.index).trim();
    if (statement) statements.push(statement);
    start = token.index + 1;
  }
  const last = body.slice(start).trim();
  if (last) statements.push(last);
  return statements;
}
