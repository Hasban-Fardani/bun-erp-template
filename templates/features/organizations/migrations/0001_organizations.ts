import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `-- Better Auth organization plugin tables (docs/architecture.md).
--
-- Table and column names follow the plugin contract verbatim (snake_case), not our own taste:
-- the Drizzle adapter compares the adapter schema map against getAuthTables() and the plugin
-- writes these columns. Teams are disabled, so no team/team_member tables exist.

create table if not exists organization (
  id uuid primary key default uuidv7(),
  name text not null,
  slug text not null,
  logo text,
  metadata text,
  created_at timestamptz not null default now()
);

create unique index if not exists organization_slug_idx on organization (slug);

create table if not exists member (
  id uuid primary key default uuidv7(),
  organization_id uuid not null references organization (id) on delete cascade,
  user_id uuid not null references "user" (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create index if not exists member_organization_idx on member (organization_id);
create index if not exists member_user_idx on member (user_id);
create unique index if not exists member_organization_user_idx on member (organization_id, user_id);

create table if not exists invitation (
  id uuid primary key default uuidv7(),
  organization_id uuid not null references organization (id) on delete cascade,
  email text not null,
  role text,
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  inviter_id uuid not null references "user" (id) on delete cascade
);

create index if not exists invitation_organization_idx on invitation (organization_id);
create index if not exists invitation_email_idx on invitation (email);

alter table "session" add column if not exists active_organization_id uuid;

create index if not exists session_active_organization_idx on "session" (active_organization_id);

-- Idempotent constraint creation: Postgres has no 'add constraint if not exists'.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'session_active_organization_fk') then
    alter table "session" add constraint session_active_organization_fk
      foreign key (active_organization_id) references organization (id) on delete set null;
  end if;
end $$;
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
