create table if not exists posts (
  id uuid primary key default uuidv7(),
  organization_id uuid not null references organizations (id),
  author_id uuid not null references "user" (id),
  title text not null,
  slug text not null,
  content text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists posts_organization_slug_idx
  on posts (organization_id, slug);

create index if not exists posts_organization_title_idx
  on posts (organization_id, title);
