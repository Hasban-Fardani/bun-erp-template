import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `
create table notifications (
  id uuid primary key default uuidv7(),
  user_id uuid not null references "user" (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, read_at, created_at);
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
