-- Format: one file = one forward-only step, run in order.
-- Every business table carries organization_id from the start (ADR-0004).

create table if not exists organizations (
  id uuid primary key default uuidv7(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
