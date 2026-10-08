import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

// A cache table is an optimisation, never a source of truth: it is safe to truncate at any time.
// `expires_at` is compared with the database clock, and the `cache.prune` schedule deletes expired rows.
const statements = `
create table cache_entries (
  key text primary key,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index cache_entries_expires_idx on cache_entries (expires_at);
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
