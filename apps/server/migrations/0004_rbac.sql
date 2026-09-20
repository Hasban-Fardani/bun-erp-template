-- RBAC: statemen + role + penugasan berlingkup (PRD §RBAC, model spatie/laravel-permission).
--
-- Kenapa bukan `users.role` tunggal: satu orang sering punya lebih dari satu peran, dan
-- role itu sering hanya berlaku pada satu bagian organisasi ("manajer departemen X").
-- Kolom tunggal di `user` tidak bisa menyatakan itu tanpa duplikasi akun.
--
-- Empat tabel, bukan dua:
--   permissions      apa yang bisa dilakukan (statis, ditulis di kode + di-seed)
--   roles            kumpulan izin (dinamis, diubah runtime oleh admin)
--   role_permissions izin apa saja milik sebuah role
--   user_roles       siapa memegang role apa, dan pada lingkup mana
--
-- `scope_id` NULL = role berlaku di seluruh organisasi. Terisi = hanya pada satu
-- departemen. Departemen jadi OPSIONAL: user tanpa departemen tetap bisa punya role.
-- Itu sebabnya department_id tidak pernah menjadi kolom di tabel user.

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
  -- Role sistem tidak boleh dihapus lewat UI; ia jaring pengaman supaya selalu ada
  -- jalur masuk ketika role buatan admin salah dikonfigurasi.
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
  -- 'organization' | 'department' — dibiarkan teks, bukan enum, karena lingkup baru
  -- (mis. 'branch', 'project') akan muncul di instance client tanpa migrasi.
  scope_type text,
  scope_id uuid,
  created_at timestamptz not null default now(),
  constraint user_roles_scope_pair check ((scope_type is null) = (scope_id is null))
);

-- Penugasan yang sama tidak boleh dobel; ini yang membuat assign idempotent.
create unique index if not exists user_roles_unique_idx
  on user_roles (user_id, role_id, coalesce(scope_type, ''), coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists user_roles_user_idx on user_roles (user_id)
