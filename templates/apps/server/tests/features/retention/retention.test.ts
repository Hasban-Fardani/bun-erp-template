import { expect, test } from "bun:test";
import { createUuid } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import type { Database } from "@/database/index.ts";
import { rowsOf } from "@/database/rows.ts";
import { createSchedules } from "@/features/jobs.ts";
import { pruneRetention, retentionOptionsFromEnv } from "@/features/retention.ts";
import { createTestContext } from "../../support/fixtures.ts";

const options = { jobsDays: 7, notificationsDays: 30, aiMessagesDays: 30, batchSize: 100 };

async function count(db: Database, table: string, where: ReturnType<typeof sql>): Promise<number> {
  const rows = rowsOf<{ n: number }>(
    await db.execute(sql`select count(*)::int as n from ${sql.raw(table)} where ${where}`),
  );
  return Number(rows[0]?.n ?? 0);
}

async function makeUser(db: Database): Promise<string> {
  const id = createUuid();
  await db.execute(sql`insert into "user" (id, name, email) values (${id}, 'Retention', ${`${id}@retention.test`})`);
  return id;
}

async function fixture() {
  const { db } = await createTestContext();
  return { db, userId: await makeUser(db), tag: createUuid() };
}

test("expired sessions and verifications are removed, live ones stay", async () => {
  const { db, userId, tag } = await fixture();
  await db.execute(sql`
    insert into session (token, user_id, expires_at) values
      (${`old-${tag}`}, ${userId}, now() - interval '1 day'),
      (${`live-${tag}`}, ${userId}, now() + interval '1 day')`);
  await db.execute(sql`
    insert into verification (identifier, value, expires_at) values
      (${`old-${tag}`}, 'v', now() - interval '1 day'),
      (${`live-${tag}`}, 'v', now() + interval '1 day')`);

  const result = await pruneRetention(db, options);

  expect(result.sessions).toBeGreaterThanOrEqual(1);
  expect(result.verifications).toBeGreaterThanOrEqual(1);
  expect(await count(db, "session", sql`token = ${`old-${tag}`}`)).toBe(0);
  expect(await count(db, "session", sql`token = ${`live-${tag}`}`)).toBe(1);
  expect(await count(db, "verification", sql`identifier = ${`old-${tag}`}`)).toBe(0);
  expect(await count(db, "verification", sql`identifier = ${`live-${tag}`}`)).toBe(1);
});

test("stale rate-limit windows are removed, current ones stay", async () => {
  const { db } = await createTestContext();
  const tag = createUuid();
  const nowSeconds = Math.floor(Date.now() / 1000);
  await db.execute(sql`
    insert into api_rate_limits (key, window_start, count) values
      (${`old-${tag}`}, ${nowSeconds - 5 * 86400}, 3),
      (${`new-${tag}`}, ${nowSeconds}, 3)`);
  await db.execute(sql`
    insert into rate_limit (id, key, count, last_request) values
      (${`old-${tag}`}, ${`old-${tag}`}, 1, ${Date.now() - 5 * 86400_000}),
      (${`new-${tag}`}, ${`new-${tag}`}, 1, ${Date.now()})`);

  await pruneRetention(db, options);

  expect(await count(db, "api_rate_limits", sql`key like ${`%-${tag}`}`)).toBe(1);
  expect(await count(db, "rate_limit", sql`key like ${`%-${tag}`}`)).toBe(1);
  expect(await count(db, "api_rate_limits", sql`key = ${`new-${tag}`}`)).toBe(1);
});

test("old finished jobs, read notifications and ai messages are removed; unfinished work stays", async () => {
  const { db, userId, tag } = await fixture();
  await db.execute(sql`
    insert into background_jobs (id, job_name, payload, status, completed_at, updated_at) values
      (${`done-old-${tag}`}, 'x', '{}', 'completed', now() - interval '30 days', now() - interval '30 days'),
      (${`done-new-${tag}`}, 'x', '{}', 'completed', now(), now()),
      (${`pending-old-${tag}`}, 'x', '{}', 'pending', null, now() - interval '30 days')`);
  await db.execute(sql`
    insert into notifications (user_id, type, title, read_at, created_at) values
      (${userId}, ${tag}, 'read old', now() - interval '90 days', now() - interval '90 days'),
      (${userId}, ${tag}, 'unread old', null, now() - interval '90 days'),
      (${userId}, ${tag}, 'read new', now(), now())`);
  const conversationId = createUuid();
  await db.execute(sql`insert into ai_conversations (id, user_id) values (${conversationId}, ${userId})`);
  await db.execute(sql`
    insert into ai_messages (conversation_id, role, content, created_at) values
      (${conversationId}, 'user', 'old', now() - interval '90 days'),
      (${conversationId}, 'user', 'new', now())`);

  await pruneRetention(db, options);

  expect(await count(db, "background_jobs", sql`id like ${`%-${tag}`}`)).toBe(2);
  expect(await count(db, "background_jobs", sql`id = ${`done-old-${tag}`}`)).toBe(0);
  expect(await count(db, "notifications", sql`type = ${tag}`)).toBe(2);
  expect(await count(db, "notifications", sql`type = ${tag} and title = 'read old'`)).toBe(0);
  expect(await count(db, "ai_messages", sql`conversation_id = ${conversationId}`)).toBe(1);
});

test("each statement is bounded by the batch size and a rerun finishes the backlog", async () => {
  const { db, userId, tag } = await fixture();
  for (let i = 0; i < 5; i += 1) {
    await db.execute(
      sql`insert into session (token, user_id, expires_at) values (${`b${i}-${tag}`}, ${userId}, now() - interval '1 day')`,
    );
  }
  const small = { ...options, batchSize: 2 };
  const first = await pruneRetention(db, small);
  expect(first.sessions).toBeLessThanOrEqual(2);
  for (let i = 0; i < 10; i += 1) await pruneRetention(db, small);
  expect(await count(db, "session", sql`token like ${`b%-${tag}`}`)).toBe(0);
  expect((await pruneRetention(db, small)).sessions).toBe(0);
});

test("the retention schedule is registered with a non-frequent cron and env drives the options", async () => {
  const ctx = await createTestContext();
  const schedule = createSchedules(ctx).find((entry) => entry.name === "retention.prune");
  expect(schedule).toBeDefined();
  expect(schedule?.cron).not.toContain("*/");
  const parsed = retentionOptionsFromEnv(ctx.env);
  expect(parsed.jobsDays).toBe(ctx.env.RETENTION_JOBS_DAYS);
  expect(parsed.batchSize).toBe(ctx.env.RETENTION_BATCH_SIZE);
});
