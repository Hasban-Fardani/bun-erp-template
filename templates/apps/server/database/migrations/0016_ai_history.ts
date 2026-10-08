import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

// Assistant history (docs/ai.md). `ai_conversations` is self-scoped like notifications: every query
// filters on user_id. Turns live in `ai_messages` and cascade with their conversation; the content
// is user data and is never written to logs or the audit trail.
const statements = `
create table ai_conversations (
  id uuid primary key default uuidv7(),
  user_id uuid not null references "user" (id) on delete cascade,
  title text not null default '',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_user_idx on ai_conversations (user_id, updated_at);

create table ai_messages (
  id uuid primary key default uuidv7(),
  conversation_id uuid not null references ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx on ai_messages (conversation_id, created_at, id);
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
