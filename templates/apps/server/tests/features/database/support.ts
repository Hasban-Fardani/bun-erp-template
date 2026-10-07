import { sql } from "drizzle-orm";
import type { AppContext } from "../../../bootstrap/context.ts";
import { rowsOf } from "../../../database/rows.ts";

/**
 * Shared fixtures for the migration-runner suites: a throwaway directory per case and the two
 * probes both files need. Kept here so the runner and ledger suites cannot drift apart.
 *
 * A fresh directory per test keeps a migration run reproducible, not order-dependent.
 * `mktemp -d` stands in for `mkdtemp` — Bun exposes no temp-directory API of its own.
 */
export async function scopedDir(files: Record<string, string>): Promise<string> {
  // `new URL` resolves the `..` segments: Bun's dynamic import only finds a file written after
  // the first load when the directory path it receives is already normalized.
  const root = new URL("../../../../../.data", import.meta.url).pathname;
  await Bun.$`mkdir -p ${root}`.quiet();
  const dir = (await Bun.$`mktemp -d ${`${root}/erp-migrations-XXXXXX`}`.text()).trim();
  for (const [name, body] of Object.entries(files)) await Bun.write(`${dir}/${name}`, migrationModule(body));
  return dir;
}

export function migrationModule(source: string): string {
  return `import { runSqlMigration } from "../../apps/server/database/sql-migration.ts";\nexport async function up(db: { execute: (query: unknown) => Promise<unknown> }) { await runSqlMigration(db, ${JSON.stringify(source)}); }\n`;
}

export async function appliedNames(context: AppContext): Promise<string[]> {
  const result = await context.db.execute<{ name: string }>(sql`select name from _migrations`);
  return rowsOf<{ name: string }>(result)
    .map((row) => row.name)
    .sort();
}

export async function tableExists(context: AppContext, name: string): Promise<boolean> {
  const result = await context.db.execute<{ exists: boolean }>(
    sql`select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = ${name}) as exists`,
  );
  return rowsOf<{ exists: boolean }>(result)[0]?.exists ?? false;
}
