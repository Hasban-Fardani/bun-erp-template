-- Audit trail (PRD §12, ADR-0007). Append-only: no update/delete in code.
--
-- `actor_id` deliberately has NO foreign key to "user": deleting a user must not also
-- delete the evidence of their actions. `actor_label` stores the actor name as frozen text
-- at the moment of the event, because names can change while records must not.

create table if not exists audit_logs (
  id uuid primary key default uuidv7(),
  organization_id uuid references organizations (id),
  actor_id uuid,
  actor_label text not null default '',
  -- `domain.action_result`, e.g. `user.role_assigned`.
  event text not null,
  subject_type text not null default '',
  subject_id text not null default '',
  before jsonb,
  after jsonb,
  -- requestId from the envelope: an event can be traced to the server log.
  trace_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_organization_created_idx
  on audit_logs (organization_id, created_at);

create index if not exists audit_logs_event_idx on audit_logs (event);

create index if not exists audit_logs_subject_idx on audit_logs (subject_type, subject_id)
