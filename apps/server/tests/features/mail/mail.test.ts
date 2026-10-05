import { expect, test } from "bun:test";
import { enqueueJob, runNextJob } from "../../../platform/jobs/queue.ts";
import { JobRegistry } from "../../../platform/jobs/registry.ts";
import { createMemoryMailDriver } from "../../../platform/mail/drivers/memory.ts";
import { registerMailJobs } from "../../../platform/mail/job.ts";
import { createMailer, htmlToText, resolveMail } from "../../../platform/mail/mailer.ts";
import { createMailRegistry } from "../../../platform/mail/registry.ts";
import type { Logger } from "../../../platform/observability/logger.ts";
import { createTestContext, testEnv, truncateAll } from "../../support/fixtures.ts";

const logger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

test("resolveMail applies the configured from-address and derives a text body", () => {
  const resolved = resolveMail({ to: "user@example.test", subject: "Halo", html: "<p>Halo <b>dunia</b></p>" }, testEnv);
  expect(resolved.from).toEqual({ address: "no-reply@example.test", name: "Bun ERP Template" });
  expect(resolved.to).toEqual([{ address: "user@example.test", name: "" }]);
  expect(resolved.text).toBe("Halo dunia");
});

test("resolveMail rejects a message without body, subject, or a valid recipient", () => {
  expect(() => resolveMail({ to: "user@example.test", subject: "Halo" }, testEnv)).toThrow("html or text");
  expect(() => resolveMail({ to: "user@example.test", subject: "   ", text: "x" }, testEnv)).toThrow("subject");
  expect(() => resolveMail({ to: "not-an-email", subject: "Halo", text: "x" }, testEnv)).toThrow("Invalid email");
});

test("htmlToText keeps readable structure without markup", () => {
  expect(htmlToText("<h1>Judul</h1><p>Satu</p><p>Dua</p>")).toBe("Judul\nSatu\nDua");
});

test("the driver registry resolves built-ins and rejects an unknown driver", () => {
  const registry = createMailRegistry();
  expect(registry.names()).toContain("log");
  expect(registry.has("smtp")).toBe(true);
  const driver = registry.create("memory", { env: testEnv, logger });
  expect(driver.name).toBe("memory");
  expect(() => registry.create("carrier-pigeon", { env: testEnv, logger })).toThrow("Unknown mail driver");
});

test("send delivers through the selected driver and exposes its name", async () => {
  const driver = createMemoryMailDriver();
  const mailer = createMailer({ env: testEnv, logger, driver });
  const result = await mailer.send({ to: [{ address: "a@example.test", name: "A" }], subject: "Halo", text: "Isi" });
  expect(result.driver).toBe("memory");
  expect(driver.sent).toHaveLength(1);
  expect(driver.sent[0]?.to).toEqual([{ address: "a@example.test", name: "A" }]);
});

test("queue without a transport falls back to inline send", async () => {
  const driver = createMemoryMailDriver();
  const mailer = createMailer({ env: testEnv, logger, driver });
  await mailer.queue({ to: "a@example.test", subject: "Halo", text: "Isi" });
  expect(driver.sent).toHaveLength(1);
});

test("a queued message is delivered by the worker through the registered mail job", async () => {
  const ctx = await createTestContext();
  await truncateAll(ctx);
  const driver = createMemoryMailDriver();
  const mailer = createMailer({
    env: testEnv,
    logger,
    driver,
    enqueue: (input) =>
      enqueueJob(ctx.db, {
        name: input.name,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey,
        runAt: input.runAt,
      }),
  });

  const jobId = await mailer.queue(
    { to: "queued@example.test", subject: "Dari queue", text: "Isi" },
    { idempotencyKey: "welcome-1" },
  );
  expect(jobId).toBeTruthy();
  expect(driver.sent).toHaveLength(0);

  const registry = new JobRegistry();
  registerMailJobs(registry, mailer);
  expect(await runNextJob(ctx.db, registry, logger)).toBe(true);

  expect(driver.sent).toHaveLength(1);
  expect(driver.sent[0]?.subject).toBe("Dari queue");
});

test("resolveMail normalizes cc, bcc, reply-to, attachments, and a from override", () => {
  const resolved = resolveMail(
    {
      to: ["a@example.test", { address: "b@example.test", name: "Bee" }],
      cc: "c@example.test",
      bcc: "d@example.test",
      replyTo: "reply@example.test",
      subject: "  Status  ",
      text: "Isi",
      from: { address: "billing@example.test", name: "Billing" },
      attachments: [{ filename: "invoice.txt", content: "aGk=", contentType: "text/plain" }],
    },
    testEnv,
  );
  expect(resolved.subject).toBe("Status");
  expect(resolved.to).toEqual([
    { address: "a@example.test", name: "" },
    { address: "b@example.test", name: "Bee" },
  ]);
  expect(resolved.cc).toEqual([{ address: "c@example.test", name: "" }]);
  expect(resolved.bcc).toEqual([{ address: "d@example.test", name: "" }]);
  expect(resolved.replyTo).toEqual({ address: "reply@example.test", name: "" });
  expect(resolved.from).toEqual({ address: "billing@example.test", name: "Billing" });
  expect(resolved.attachments).toEqual([{ filename: "invoice.txt", content: "aGk=", contentType: "text/plain" }]);
});

test("resolveMail rejects a subject over 240 characters", () => {
  expect(() => resolveMail({ to: "a@example.test", subject: "x".repeat(241), text: "x" }, testEnv)).toThrow("240");
});

test("the log driver records a structured mail.sent event", async () => {
  const calls: Record<string, unknown>[] = [];
  const capture: Logger = { ...logger, info: (fields) => calls.push(fields) };
  const registry = createMailRegistry();
  await registry
    .create("log", { env: testEnv, logger: capture })
    .send(resolveMail({ to: ["a@example.test", "b@example.test"], subject: "Halo", text: "Isi" }, testEnv));
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ event: "mail.sent", driver: "log", subject: "Halo" });
  expect(calls[0]?.to).toEqual(["a@example.test", "b@example.test"]);
});

test("the registry accepts a project driver without editing the core", async () => {
  const sent: string[] = [];
  const registry = createMailRegistry().register("capture", () => ({
    name: "capture",
    async send(message) {
      sent.push(message.subject);
      return { driver: "capture", messageId: "1" };
    },
  }));
  await createMailer({
    env: testEnv,
    logger,
    registry,
    driver: registry.create("capture", { env: testEnv, logger }),
  }).send({ to: "a@example.test", subject: "Custom", text: "x" });
  expect(sent).toEqual(["Custom"]);
});

test("queue forwards idempotencyKey and runAt to the transport", async () => {
  const enqueued: { idempotencyKey?: string; runAt?: Date; payload: { subject: string } }[] = [];
  const mailer = createMailer({
    env: testEnv,
    logger,
    driver: createMemoryMailDriver(),
    enqueue: async (input) => {
      enqueued.push(input);
      return "job-1";
    },
  });
  const runAt = new Date("2026-01-01T00:00:00Z");
  const id = await mailer.queue(
    { to: "a@example.test", subject: "Nanti", text: "x" },
    { idempotencyKey: "k-1", runAt },
  );
  expect(id).toBe("job-1");
  expect(enqueued[0]?.idempotencyKey).toBe("k-1");
  expect(enqueued[0]?.runAt).toBe(runAt);
  expect(enqueued[0]?.payload.subject).toBe("Nanti");
});
