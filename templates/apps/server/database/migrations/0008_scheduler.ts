import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `
create table job_schedules (
  name text primary key,
  cron text not null,
  timezone text not null default 'UTC',
  last_run_at timestamptz,
  next_run_at timestamptz not null,
  locked_until timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_schedules_due_idx on job_schedules (next_run_at);
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
