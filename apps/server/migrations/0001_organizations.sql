-- Format: satu file = satu langkah forward-only, dijalankan berurutan.
-- Semua tabel bisnis membawa organization_id sejak awal (ADR-0004).

create table if not exists organizations (
  id uuid primary key default uuidv7(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
