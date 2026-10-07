import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

/**
 * Better Auth `rateLimit.storage: "database"` store. Better Auth 1.7.5's schema check and its
 * generated Drizzle schema expect an `id` primary key and a unique `key` column; `last_request`
 * is epoch milliseconds.
 */
const statements = `
create table rate_limit (
  id text primary key,
  key text not null unique,
  count integer not null,
  last_request bigint not null
);
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
