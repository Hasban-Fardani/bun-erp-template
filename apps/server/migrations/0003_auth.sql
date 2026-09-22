-- Better Auth identity tables (PRD §17 Phase 2 "Identity", ADR-0009).
--
-- Table and column names follow the Better Auth contract verbatim (snake_case), not
-- our own taste: the Drizzle adapter compares the physical schema against `getAuthTables()` and
-- refuses to run when they differ. Renaming means switching that check off.
--
-- `organization_id` on the user table is deliberately NULLABLE. Sign-up happens before an admin
-- assigns an organization, so forcing NOT NULL would make the first sign-up impossible.
-- The column exists from the start (ADR-0004) so no expand-contract is needed later.

create table if not exists "user" (
  id uuid primary key default uuidv7(),
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  organization_id uuid references organizations (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists "session" (
  id uuid primary key default uuidv7(),
  expires_at timestamptz not null,
  token text not null unique,
  ip_address text,
  user_agent text,
  user_id uuid not null references "user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_user_idx on "session" (user_id);

create table if not exists "account" (
  id uuid primary key default uuidv7(),
  account_id text not null,
  provider_id text not null,
  user_id uuid not null references "user" (id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_user_idx on "account" (user_id);
create unique index if not exists account_provider_account_idx on "account" (provider_id, account_id);

create table if not exists "verification" (
  id uuid primary key default uuidv7(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists verification_identifier_idx on "verification" (identifier)
