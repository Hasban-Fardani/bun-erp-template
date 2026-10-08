import { sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { rowsOf } from "../../database/rows.ts";

export type RateLimitHit = { count: number; retryAfterSeconds: number };

/**
 * Counts one request in a fixed window with a single `INSERT ... ON CONFLICT ... RETURNING`.
 * The upsert is atomic, so concurrent replicas cannot undercount, and it costs one query per
 * request on every target.
 */
export async function hitApiRateLimit(
  db: Database,
  input: { key: string; windowSeconds: number; nowMs: number },
): Promise<RateLimitHit> {
  const nowSeconds = Math.floor(input.nowMs / 1000);
  const windowStart = nowSeconds - (nowSeconds % input.windowSeconds);
  const result = await db.execute(sql`
    insert into api_rate_limits (key, window_start, count)
    values (${input.key}, ${windowStart}, 1)
    on conflict (key) do update set
      count = case when api_rate_limits.window_start = excluded.window_start then api_rate_limits.count + 1 else 1 end,
      window_start = excluded.window_start
    returning count
  `);
  const count = Number(rowsOf<{ count: number }>(result)[0]?.count ?? 1);
  return { count, retryAfterSeconds: windowStart + input.windowSeconds - nowSeconds };
}
