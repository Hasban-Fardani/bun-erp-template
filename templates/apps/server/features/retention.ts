import { sql } from "drizzle-orm";
import type { Env } from "../config/index.ts";
import type { Database } from "../database/index.ts";
import { rowsOf } from "../database/rows.ts";

export type RetentionOptions = {
  /** Finished (`completed` or `dead`) background jobs older than this are removed. */
  jobsDays: number;
  /** Read notifications older than this are removed; unread ones stay. */
  notificationsDays: number;
  /** AI conversation turns older than this are removed. */
  aiMessagesDays: number;
  /** Row cap per table per run, so one run stays one cheap statement per table. */
  batchSize: number;
};

export type RetentionResult = {
  sessions: number;
  verifications: number;
  rateLimits: number;
  apiRateLimits: number;
  jobs: number;
  notifications: number;
  aiMessages: number;
};

export function retentionOptionsFromEnv(
  env: Pick<
    Env,
    "RETENTION_JOBS_DAYS" | "RETENTION_NOTIFICATIONS_DAYS" | "RETENTION_AI_MESSAGES_DAYS" | "RETENTION_BATCH_SIZE"
  >,
): RetentionOptions {
  return {
    jobsDays: env.RETENTION_JOBS_DAYS,
    notificationsDays: env.RETENTION_NOTIFICATIONS_DAYS,
    aiMessagesDays: env.RETENTION_AI_MESSAGES_DAYS,
    batchSize: env.RETENTION_BATCH_SIZE,
  };
}

/** The daily AI quota is the longest fixed window stored in `api_rate_limits`; keep two days of margin. */
const API_RATE_LIMIT_KEEP_SECONDS = 2 * 86_400;
const RATE_LIMIT_KEEP_MS = 86_400_000;

/**
 * One `DELETE ... WHERE ctid IN (SELECT ... LIMIT n)` per table. Every run is bounded and
 * idempotent: a backlog drains over successive runs, and a table with nothing to prune costs one
 * indexed-or-small scan. Safe to run concurrently (`skip locked`).
 */
async function deleteBatch(db: Database, table: string, condition: ReturnType<typeof sql>, limit: number) {
  const result = await db.execute(sql`
    with doomed as (
      select ctid from ${sql.raw(table)} where ${condition} limit ${limit} for update skip locked
    )
    delete from ${sql.raw(table)} where ctid in (select ctid from doomed)
    returning 1
  `);
  return rowsOf<unknown>(result).length;
}

export async function pruneRetention(db: Database, options: RetentionOptions): Promise<RetentionResult> {
  const limit = options.batchSize;
  const nowMs = Date.now();
  const days = (value: number) => sql`now() - make_interval(days => ${value})`;
  return {
    sessions: await deleteBatch(db, "session", sql`expires_at < now()`, limit),
    verifications: await deleteBatch(db, "verification", sql`expires_at < now()`, limit),
    rateLimits: await deleteBatch(db, "rate_limit", sql`last_request < ${nowMs - RATE_LIMIT_KEEP_MS}`, limit),
    apiRateLimits: await deleteBatch(
      db,
      "api_rate_limits",
      sql`window_start < ${Math.floor(nowMs / 1000) - API_RATE_LIMIT_KEEP_SECONDS}`,
      limit,
    ),
    jobs: await deleteBatch(
      db,
      "background_jobs",
      sql`status in ('completed', 'dead') and updated_at < ${days(options.jobsDays)}`,
      limit,
    ),
    notifications: await deleteBatch(
      db,
      "notifications",
      sql`read_at is not null and read_at < ${days(options.notificationsDays)}`,
      limit,
    ),
    aiMessages: await deleteBatch(db, "ai_messages", sql`created_at < ${days(options.aiMessagesDays)}`, limit),
  };
}
