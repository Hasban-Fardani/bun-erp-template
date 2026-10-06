import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `-- departments module (reference module, PRD §6).

create table if not exists departments (
  id uuid primary key default uuidv7(),
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists departments_code_idx
  on departments (code);

create index if not exists departments_name_idx
  on departments (name)
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
