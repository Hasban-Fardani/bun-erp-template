import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `-- RBAC: statements + roles + assignment (PRD §RBAC, spatie/laravel-permission model).
--
-- Why not a single users.role: one person often holds more than one role. A single column on
-- user cannot express that without duplicating accounts.
--
-- Four tables, not two:
--   permissions      what can be done (static, written in code + seeded)
--   roles            a bundle of permissions (dynamic, changed at runtime by admins)
--   role_permissions which permissions a role owns
--   user_roles       who holds which role
--
-- The default server is single-tenant: roles and assignments are global (F3.0 Q28). Tenant
-- scoping, if a deployment needs it, belongs to the opt-in organizations feature.

create table if not exists permissions (
  id uuid primary key default uuidv7(),
  key text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default uuidv7(),
  key text not null unique,
  name text not null,
  description text not null default '',
  -- System roles cannot be deleted through the UI; they are the safety net so there is always
  -- a way in when an admin-built role is misconfigured.
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists user_roles (
  id uuid primary key default uuidv7(),
  user_id uuid not null references "user" (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- The same assignment must not double up; this is what makes assign idempotent.
create unique index if not exists user_roles_unique_idx on user_roles (user_id, role_id);

create index if not exists user_roles_user_idx on user_roles (user_id)
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
