import { sql } from "drizzle-orm";
import type { Database } from "./index.ts";

const MIGRATIONS_TABLE = `
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

/** One app-wide advisory lock key: every replica serializes migration steps on it. */
const MIGRATION_LOCK_KEY = 2026100701;

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
    const appliedNow = await db.transaction(async (tx) => {
      // Two replicas can boot together; the transaction-scoped lock serializes them and the ledger
      // is re-read inside it so the loser skips a step the winner just committed instead of replaying it.
      await tx.execute(sql`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);
      const ledger = rowsOf<{ name: string }>(await tx.execute<{ name: string }>(sql`select name from _migrations`));
      if (ledger.some(({ name }) => migrationId(name) === migrationId(file))) return false;
      await migration.up?.(tx as unknown as Database);
      await tx.execute(sql`insert into _migrations (name) values (${file})`);
      return true;
    });
    if (appliedNow) ran.push(file);
  }
  return ran;
}

/**
 * The full filename stem is the step identity: `0002_alpha` and `0002_beta` are distinct files even
 * though they share a number, while a legacy `0001_probe.sql` still suppresses its `0001_probe.ts`
 * replacement.
 */
function migrationId(file: string): string {
  return file.replace(/\.(ts|sql)$/, "");
}

export { splitSqlStatements } from "./sql-migration.ts";

/** Normalize Drizzle query results at the one boundary used by migrations and fixtures. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}
