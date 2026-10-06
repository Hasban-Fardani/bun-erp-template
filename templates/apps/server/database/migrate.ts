import { sql } from "drizzle-orm";
import type { Database } from "./index.ts";

const MIGRATIONS_TABLE = `
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

/** TypeScript migrations execute in filename order and commit one complete step at a time. */
export async function migrate(db: Database, dir: string): Promise<string[]> {
  await db.execute(sql.raw(MIGRATIONS_TABLE));
  const rows = await db.execute<{ name: string }>(sql`select name from _migrations`);
  const applied = new Set(rowsOf<{ name: string }>(rows).map(({ name }) => migrationId(name)));
  const files = [...new Bun.Glob("*.ts").scanSync({ cwd: dir })]
    .filter((file) => /^\d{4}_[a-z0-9_]+\.ts$/.test(file))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(migrationId(file))) continue;
    const migration = (await import(`${dir}/${file}`)) as { up?: (database: Database) => Promise<void> };
    if (typeof migration.up !== "function") throw new Error(`Migration ${file} must export up(database)`);
    await db.transaction(async (tx) => {
      await migration.up?.(tx as unknown as Database);
      await tx.execute(sql`insert into _migrations (name) values (${file})`);
    });
    ran.push(file);
  }
  return ran;
}

/** SQL and TypeScript ledger entries share their numbered identity during this format change. */
function migrationId(file: string): string {
  return file.match(/^(\d{4})_/)?.[1] ?? file;
}

export { splitSqlStatements } from "./sql-migration.ts";

/** Normalize Drizzle query results at the one boundary used by migrations and fixtures. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}
