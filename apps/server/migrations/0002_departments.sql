-- Module departments (reference module, PRD §6).

create table if not exists departments (
  id uuid primary key default uuidv7(),
  organization_id uuid not null references organizations (id),
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists departments_organization_code_idx
  on departments (organization_id, code);

create index if not exists departments_organization_name_idx
  on departments (organization_id, name)
