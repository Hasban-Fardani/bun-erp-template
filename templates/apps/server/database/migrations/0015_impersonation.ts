import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

// An impersonation is a normal `session` row for the target user whose `impersonated_by` names the
// admin. It cascades with either user, and a plain sign-in never reads it (it has its own cookie).
// Audit rows keep `impersonator_id` WITHOUT a foreign key, like `actor_id`: evidence outlives users.
const statements = `
alter table session add column impersonated_by uuid references "user" (id) on delete cascade;

create index session_impersonated_by_idx on session (impersonated_by) where impersonated_by is not null;

alter table audit_logs add column impersonator_id uuid;

alter table audit_logs add column impersonator_label text not null default ''
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
