-- RBAC: statements + roles + scoped assignment (PRD §RBAC, spatie/laravel-permission model).
--
-- Why not a single `users.role`: one person often holds more than one role, and that
-- role often applies only to one part of the organization ("manager of department X").
-- A single column on `user` cannot express that without duplicating accounts.
--
-- Four tables, not two:
--   permissions      what can be done (static, written in code + seeded)
--   roles            a bundle of permissions (dynamic, changed at runtime by admins)
--   role_permissions which permissions a role owns
--   user_roles       who holds which role, and at which scope
--
-- `scope_id` NULL = the role applies to the whole organization. Set = only within one
-- department, so departments stay OPTIONAL: a user without one can still hold a role.
-- That is why department_id never becomes a column on the user table.

create table if not exists permissions (
  id uuid primary key default uuidv7(),
  key text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default uuidv7(),
  organization_id uuid not null references organizations (id),
  key text not null,
  name text not null,
  description text not null default '',
  -- System roles cannot be deleted through the UI; they are the safety net so there is always
  -- a way in when an admin-built role is misconfigured.
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists roles_organization_key_idx on roles (organization_id, key);

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
  -- 'organization' | 'department' — kept as text, not an enum, because new scopes
  -- (e.g. 'branch', 'project') will appear in client instances without a migration.
  scope_type text,
  scope_id uuid,
  created_at timestamptz not null default now(),
  constraint user_roles_scope_pair check ((scope_type is null) = (scope_id is null))
);

-- The same assignment must not double up; this is what makes assign idempotent.
create unique index if not exists user_roles_unique_idx
  on user_roles (user_id, role_id, coalesce(scope_type, ''), coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists user_roles_user_idx on user_roles (user_id)
