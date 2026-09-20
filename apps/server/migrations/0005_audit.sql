-- Jejak audit (PRD §12, ADR-0007). Append-only: tidak ada update/delete di kode.
--
-- `actor_id` sengaja TANPA foreign key ke "user": menghapus pengguna tidak boleh ikut
-- menghapus bukti perbuatannya. `actor_label` menyimpan nama pelaku sebagai teks beku
-- pada saat kejadian, karena nama bisa berubah sedangkan catatan tidak boleh.

create table if not exists audit_logs (
  id uuid primary key default uuidv7(),
  organization_id uuid references organizations (id),
  actor_id uuid,
  actor_label text not null default '',
  -- `domain.aksi_hasil`, mis. `user.role_assigned`.
  event text not null,
  subject_type text not null default '',
  subject_id text not null default '',
  before jsonb,
  after jsonb,
  -- requestId dari envelope: satu kejadian bisa dilacak sampai ke log server.
  trace_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_organization_created_idx
  on audit_logs (organization_id, created_at);

create index if not exists audit_logs_event_idx on audit_logs (event);

create index if not exists audit_logs_subject_idx on audit_logs (subject_type, subject_id)
