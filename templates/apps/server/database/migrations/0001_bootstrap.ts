import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

const statements = `-- Bootstrap: shared database primitives.
--
-- The default server has no tenant concept; an opt-in organizations feature adds one later
-- (docs/architecture.md, "Better Auth" section).

-- PG18 owns uuidv7; older servers receive a compatible function without an extension.
do $bootstrap$
begin
  if current_setting('server_version_num')::integer < 180000
     and to_regprocedure('public.uuidv7()') is null then
    execute $definition$
      create function public.uuidv7() returns uuid language sql volatile as $function$
        select encode(
          set_byte(
            decode(lpad(to_hex(floor(extract(epoch from clock_timestamp()) * 1000)::bigint), 12, '0'), 'hex')
              || substring(uuid_send(gen_random_uuid()) from 7),
            6, (get_byte(uuid_send(gen_random_uuid()), 6) & 15) | 112
          ), 'hex'
        )::uuid
      $function$
    $definition$;
  end if;
end
$bootstrap$
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
