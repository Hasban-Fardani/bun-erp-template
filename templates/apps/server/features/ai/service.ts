import { sql } from "drizzle-orm";
import type { Env } from "../../config/index.ts";
import type { Database } from "../../database/index.ts";
import { rowsOf } from "../../database/rows.ts";
import { hitApiRateLimit } from "../../http/helpers/api-rate-limit.ts";
import type { AiMessage } from "../../infra/ai/index.ts";
import type { ChatInput } from "./validation.ts";

const DAY_SECONDS = 86_400;

/** The daily quota rides on the shared fixed-window table, so it holds across replicas and isolates. */
const quotaKey = (userId: string) => `ai:${userId}`;

function dayStart(nowMs: number): number {
  const seconds = Math.floor(nowMs / 1000);
  return seconds - (seconds % DAY_SECONDS);
}

/** Questions left today (UTC) without spending one. */
export async function remainingQuestions(db: Database, env: Env, userId: string, nowMs = Date.now()): Promise<number> {
  const result = await db.execute(sql`
    select count from api_rate_limits where key = ${quotaKey(userId)} and window_start = ${dayStart(nowMs)}
  `);
  const used = Number(rowsOf<{ count: number }>(result)[0]?.count ?? 0);
  return Math.max(0, env.AI_DAILY_LIMIT - used);
}

/** Spends one question, or reports when today's quota resets. */
export async function spendQuestion(
  db: Database,
  env: Env,
  userId: string,
  nowMs = Date.now(),
): Promise<{ remaining: number } | { retryAfterSeconds: number }> {
  const hit = await hitApiRateLimit(db, { key: quotaKey(userId), windowSeconds: DAY_SECONDS, nowMs });
  if (hit.count > env.AI_DAILY_LIMIT) return { retryAfterSeconds: hit.retryAfterSeconds };
  return { remaining: env.AI_DAILY_LIMIT - hit.count };
}

/**
 * Server-owned instructions. The assistant has no tools and no data access yet: it must not pretend
 * to read records it cannot see.
 */
export function buildConversation(env: Env, user: { name: string }, input: ChatInput): AiMessage[] {
  const system = [
    `You are the assistant inside ${env.APP_NAME}, an internal business application.`,
    `You are talking to ${user.name || "a signed-in user"}.`,
    "Answer in the language of the question, briefly and plainly; use short lists when they help.",
    "You cannot see or change the application's data. Say so instead of guessing figures or records.",
  ].join(" ");
  return [{ role: "system", content: system }, ...input.messages];
}
