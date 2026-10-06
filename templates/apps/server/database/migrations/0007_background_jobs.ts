import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `
create table background_jobs (
  id text primary key,
  job_name text not null,
  queue_name text not null default 'default',
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  run_at timestamptz not null default now(),
  lease_token text,
  lease_expires_at timestamptz,
  idempotency_key text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index background_jobs_due_idx on background_jobs (queue_name, status, run_at);
create index background_jobs_lease_idx on background_jobs (status, lease_expires_at);
create unique index background_jobs_idempotency_idx on background_jobs (queue_name, job_name, idempotency_key);
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
