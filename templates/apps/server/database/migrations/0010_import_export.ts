import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `
create table job_batches (
  id text primary key,
  batch_name text not null,
  queue_name text not null default 'default',
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  total integer not null check (total >= 0),
  processed integer not null default 0 check (processed >= 0),
  failed integer not null default 0 check (failed >= 0),
  chunk_size integer not null default 100 check (chunk_size > 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  metadata jsonb not null default '{}'::jsonb,
  job_id text,
  idempotency_key text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  cancelled_at timestamptz
);

create table job_batch_items (
  id text primary key,
  batch_id text not null references job_batches (id) on delete cascade,
  position integer not null check (position >= 0),
  item_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index job_batches_idempotency_idx on job_batches (batch_name, idempotency_key);
create index job_batches_status_idx on job_batches (status, created_at);
create unique index job_batch_items_key_idx on job_batch_items (batch_id, item_key);
create index job_batch_items_status_idx on job_batch_items (batch_id, status, position);
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
