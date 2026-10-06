import { expect, test } from "bun:test";
import { createMailer, createMemoryMailDriver } from "@bun-erp/mail/server";
import { createJobRegistry } from "../../../features/jobs.ts";
import { createAppMailer, createMailEnqueue } from "../../../features/mail/wiring.ts";
import { notify } from "../../../features/notifications/service.ts";
import { runNextJob } from "../../../infra/jobs/queue.ts";
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

test("the mail channel sends through the configured mailer", async () => {
  const api = await createHttpFixture();
  await api.signInAsOwner();
  const me = await dataOf<{ userId: string }>(api.client.api.v1.me.$get());
  const driver = createMemoryMailDriver();

  await notify(
    { ...api.ctx, mail: createMailer({ config: api.ctx.env, logger, driver }) },
    {
      recipients: [me.userId],
      type: "user.created",
      title: "Akun dibuat",
      body: "Akun baru tersedia.",
      via: ["mail"],
    },
  );

  expect(driver.sent).toHaveLength(1);
  expect(driver.sent[0]?.subject).toBe("Akun dibuat");
});
