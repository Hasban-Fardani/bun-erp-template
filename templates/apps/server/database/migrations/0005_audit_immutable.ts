import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `-- Evidence must survive accidental application updates and deletes, including raw SQL.
create function reject_audit_mutation() returns trigger language plpgsql as $guard$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end
$guard$;

create trigger audit_logs_immutable
  before update or delete on audit_logs
  for each statement execute function reject_audit_mutation();
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
