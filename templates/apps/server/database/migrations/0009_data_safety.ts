import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `-- data safety: numbering sequences plus soft delete/version for tables that predate 0009.

create table if not exists sequences (
  key text primary key,
  prefix text not null default '',
  padding integer not null default 0,
  next integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table if exists departments
  add column if not exists deleted_at timestamptz,
  add column if not exists version integer not null default 0
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
