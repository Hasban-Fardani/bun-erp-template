import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

/**
 * Small key/value table for process-wide switches that every replica or isolate must agree on.
 * The first key is `maintenance` (`bun erp down` / `bun erp up`). The table is authoritative;
 * readers may cache a value for a few seconds, never longer.
 */
const statements = `
create table app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
