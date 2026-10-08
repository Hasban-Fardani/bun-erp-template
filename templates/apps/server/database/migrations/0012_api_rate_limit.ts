import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

/**
 * Fixed-window counters for the business API limiter (`http/rate-limit.ts`). One row per bucket
 * key (`user:<id>` or `ip:<address>`); `window_start` is the epoch second the current window began,
 * so the table stays bounded by the number of distinct callers, not by elapsed windows. The shared
 * row is what makes the limit hold across Bun replicas and Cloudflare isolates.
 */
const statements = `
create table api_rate_limits (
  key text primary key,
  window_start bigint not null,
  count integer not null
);
`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
