import { expect, test } from "bun:test";
import { createMailer, createMemoryMailDriver } from "@bun-erp/mail/server";
import { sql } from "drizzle-orm";
import type { AppContext } from "../../../bootstrap/context.ts";
import { rowsOf } from "../../../database/rows.ts";
import { createJobRegistry } from "../../../features/jobs.ts";
import { createAppMailer, createMailEnqueue } from "../../../features/mail/wiring.ts";
import { notify } from "../../../features/notifications/service.ts";
import { enqueueJob, runNextJob } from "../../../infra/jobs/queue.ts";
import type { Logger } from "../../../infra/observability/logger.ts";
import { createHttpFixture, createTestContext, dataOf, testEnv, truncateAll } from "../../support/fixtures.ts";

const logger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

async function countMailJobs(db: AppContext["db"]): Promise<number> {
  const rows = rowsOf<{ count: number }>(
    await db.execute(sql`select count(*)::int as count from background_jobs where job_name = 'mail.send'`),
  );
  return rows[0]?.count ?? 0;
}

test("the composition root builds the mailer named by MAIL_DRIVER", async () => {
  const ctx = await createTestContext();
  expect(createAppMailer(ctx.env, logger, ctx.db).driver).toBe(testEnv.MAIL_DRIVER);
});

test("a queued message is delivered by the worker through the registered mail job", async () => {
  const ctx = await createTestContext();
  await truncateAll(ctx);
  const driver = createMemoryMailDriver();
  const mailer = createMailer({ config: testEnv, logger, driver, enqueue: createMailEnqueue(ctx.db) });

  const jobId = await mailer.queue(
    { to: "queued@example.test", subject: "Dari queue", text: "Isi" },
    { idempotencyKey: "welcome-1" },
  );
  expect(jobId).toBeTruthy();
  expect(driver.sent).toHaveLength(0);

  expect(await runNextJob(ctx.db, createJobRegistry({ ...ctx, mail: mailer }), logger)).toBe(true);
  expect(driver.sent).toHaveLength(1);
  expect(driver.sent[0]?.subject).toBe("Dari queue");
});

test("the mail channel queues a message the worker delivers", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = await dataOf<{ userId: string }>(api.client.api.v1.me.$get());
  const driver = createMemoryMailDriver();
  const mailer = createMailer({ config: api.ctx.env, logger, driver, enqueue: createMailEnqueue(api.ctx.db) });

  await notify(
    { ...api.ctx, mail: mailer },
    {
      recipients: [me.userId],
      type: "user.created",
      title: "Akun dibuat",
      body: "Akun baru tersedia.",
      via: ["mail"],
    },
  );

  expect(driver.sent).toHaveLength(0);
  expect(await runNextJob(api.ctx.db, createJobRegistry({ ...api.ctx, mail: mailer }), logger)).toBe(true);
  expect(driver.sent).toHaveLength(1);
  expect(driver.sent[0]?.subject).toBe("Akun dibuat");
});

test("the mail channel enqueues inside the caller's transaction", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = await dataOf<{ userId: string }>(api.client.api.v1.me.$get());
  const mailer = createMailer({ config: api.ctx.env, logger, enqueue: createMailEnqueue(api.ctx.db) });

  await expect(
    api.ctx.db.transaction(async (tx) => {
      await notify(
        { ...api.ctx, mail: mailer },
        { recipients: [me.userId], type: "user.created", title: "Rollback", via: ["mail"] },
        tx,
      );
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");

  // The job insert must roll back with the feature write; the root database would leave it behind.
  expect(await countMailJobs(api.ctx.db)).toBe(0);
});

test("the mail channel deduplicates repeat notifications with a stable key", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = await dataOf<{ userId: string }>(api.client.api.v1.me.$get());
  const mailer = createMailer({ config: api.ctx.env, logger, enqueue: createMailEnqueue(api.ctx.db) });
  const base = { recipients: [me.userId], type: "user.created", via: ["mail"] as const };

  await notify({ ...api.ctx, mail: mailer }, { ...base, title: "Satu", idempotencyKey: "batch-1" });
  await notify({ ...api.ctx, mail: mailer }, { ...base, title: "Satu", idempotencyKey: "batch-1" });
  expect(await countMailJobs(api.ctx.db)).toBe(1);

  await notify({ ...api.ctx, mail: mailer }, { ...base, title: "Dua", idempotencyKey: "batch-2" });
  expect(await countMailJobs(api.ctx.db)).toBe(2);

  // Without a caller key the notification content is the identity, so a retried fan-out is still one job.
  await notify({ ...api.ctx, mail: mailer }, { ...base, title: "Sama" });
  await notify({ ...api.ctx, mail: mailer }, { ...base, title: "Sama" });
  expect(await countMailJobs(api.ctx.db)).toBe(3);
});

test("a malformed mail.send payload is rejected before it reaches the driver", async () => {
  const ctx = await createTestContext();
  await truncateAll(ctx);
  const driver = createMemoryMailDriver();
  const mailer = createMailer({ config: testEnv, logger, driver, enqueue: createMailEnqueue(ctx.db) });
  const id = await enqueueJob(ctx.db, { name: "mail.send", payload: { subject: 42 }, maxAttempts: 1 });

  expect(await runNextJob(ctx.db, createJobRegistry({ ...ctx, mail: mailer }), logger)).toBe(true);
  expect(driver.sent).toHaveLength(0);
  const row = rowsOf<{ status: string; last_error_code: string }>(
    await ctx.db.execute(sql`select status, last_error_code from background_jobs where id = ${id}`),
  )[0];
  expect(row).toMatchObject({ status: "dead", last_error_code: "MAIL_PAYLOAD_INVALID" });
});
