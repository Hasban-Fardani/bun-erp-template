import { expect, test } from "bun:test";
import { createMemoryMailDriver } from "../src/server/drivers/memory.ts";
import { createMailer, htmlToText, resolveMail } from "../src/server/mailer.ts";
import { createMailRegistry } from "../src/server/registry.ts";
import type { MailConfig, MailLogger } from "../src/server/types.ts";

/** The app's validated Env satisfies this structurally; the package tests own their fixture. */
const testConfig: MailConfig = {
  MAIL_DRIVER: "log",
  MAIL_FROM_ADDRESS: "no-reply@example.test",
  MAIL_FROM_NAME: "Bun ERP Template",
  SMTP_HOST: "",
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USERNAME: "",
  SMTP_PASSWORD: "",
  MAIL_HTTP_PROVIDER: "resend",
  MAIL_API_KEY: "",
};

const logger: MailLogger = { info: () => {} };

test("resolveMail applies the configured from-address and derives a text body", () => {
  const resolved = resolveMail(
    { to: "user@example.test", subject: "Halo", html: "<p>Halo <b>dunia</b></p>" },
    testConfig,
  );
  expect(resolved.from).toEqual({ address: "no-reply@example.test", name: "Bun ERP Template" });
  expect(resolved.to).toEqual([{ address: "user@example.test", name: "" }]);
  expect(resolved.text).toBe("Halo dunia");
});

test("resolveMail rejects a message without body, subject, or a valid recipient", () => {
  expect(() => resolveMail({ to: "user@example.test", subject: "Halo" }, testConfig)).toThrow("html or text");
  expect(() => resolveMail({ to: "user@example.test", subject: "   ", text: "x" }, testConfig)).toThrow("subject");
  expect(() => resolveMail({ to: "not-an-email", subject: "Halo", text: "x" }, testConfig)).toThrow("Invalid email");
});

test("htmlToText keeps readable structure without markup", () => {
  expect(htmlToText("<h1>Judul</h1><p>Satu</p><p>Dua</p>")).toBe("Judul\nSatu\nDua");
});

test("the driver registry resolves built-ins and rejects an unknown driver", () => {
  const registry = createMailRegistry();
  expect(registry.names()).toContain("log");
  expect(registry.has("smtp")).toBe(true);
  const driver = registry.create("memory", { config: testConfig, logger });
  expect(driver.name).toBe("memory");
  expect(() => registry.create("carrier-pigeon", { config: testConfig, logger })).toThrow("Unknown mail driver");
});

test("createMailer resolves the driver named by the config", () => {
  const mailer = createMailer({ config: testConfig, logger });
  expect(mailer.driver).toBe("log");
});

test("send delivers through the selected driver and exposes its name", async () => {
  const driver = createMemoryMailDriver();
  const mailer = createMailer({ config: testConfig, logger, driver });
  const result = await mailer.send({ to: [{ address: "a@example.test", name: "A" }], subject: "Halo", text: "Isi" });
  expect(result.driver).toBe("memory");
  expect(driver.sent).toHaveLength(1);
  expect(driver.sent[0]?.to).toEqual([{ address: "a@example.test", name: "A" }]);
});

test("queue without a transport falls back to inline send", async () => {
  const driver = createMemoryMailDriver();
  const mailer = createMailer({ config: testConfig, logger, driver });
  await mailer.queue({ to: "a@example.test", subject: "Halo", text: "Isi" });
  expect(driver.sent).toHaveLength(1);
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
    testConfig,
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
  expect(() => resolveMail({ to: "a@example.test", subject: "x".repeat(241), text: "x" }, testConfig)).toThrow("240");
});

test("the log driver records a structured mail.sent event", async () => {
  const calls: Record<string, unknown>[] = [];
  const capture: MailLogger = { info: (fields) => calls.push(fields) };
  const registry = createMailRegistry();
  await registry
    .create("log", { config: testConfig, logger: capture })
    .send(resolveMail({ to: ["a@example.test", "b@example.test"], subject: "Halo", text: "Isi" }, testConfig));
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ event: "mail.sent", driver: "log", subject: "Halo" });
  expect(calls[0]?.to).toEqual(["a@example.test", "b@example.test"]);
});

test("the registry accepts a project driver without editing the package", async () => {
  const sent: string[] = [];
  const registry = createMailRegistry().register("capture", () => ({
    name: "capture",
    async send(message) {
      sent.push(message.subject);
      return { driver: "capture", messageId: "1" };
    },
  }));
  await createMailer({
    config: testConfig,
    logger,
    registry,
    driver: registry.create("capture", { config: testConfig, logger }),
  }).send({ to: "a@example.test", subject: "Custom", text: "x" });
  expect(sent).toEqual(["Custom"]);
});

test("queue forwards idempotencyKey and runAt to the transport", async () => {
  const enqueued: { idempotencyKey?: string; runAt?: Date; payload: { subject: string } }[] = [];
  const mailer = createMailer({
    config: testConfig,
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

type FetchCall = { url: string; init: RequestInit };

function mockFetch(respond: () => Response): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const mock = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  }) as unknown as typeof fetch;
  return { fetch: mock, calls };
}

const httpConfig: MailConfig = { ...testConfig, MAIL_DRIVER: "http", MAIL_API_KEY: "re_key" };

test("the http driver posts a Resend payload and returns the provider id", async () => {
  const { fetch: fetchImpl, calls } = mockFetch(() => Response.json({ id: "resend-1" }));
  const driver = createMailRegistry().create("http", { config: httpConfig, logger, fetch: fetchImpl });
  const result = await driver.send(
    resolveMail(
      {
        to: ["a@example.test", { address: "b@example.test", name: "Bee" }],
        cc: "c@example.test",
        replyTo: "reply@example.test",
        subject: "Halo",
        html: "<p>Isi</p>",
        text: "Isi",
        attachments: [{ filename: "a.txt", content: "aGk=", contentType: "text/plain" }],
      },
      httpConfig,
    ),
  );
  expect(result).toEqual({ driver: "http", messageId: "resend-1" });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.url).toBe("https://api.resend.com/emails");
  expect(calls[0]?.init.method).toBe("POST");
  const headers = new Headers(calls[0]?.init.headers);
  expect(headers.get("authorization")).toBe("Bearer re_key");
  expect(headers.get("content-type")).toBe("application/json");
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
    from: "Bun ERP Template <no-reply@example.test>",
    to: ["a@example.test", "Bee <b@example.test>"],
    cc: ["c@example.test"],
    reply_to: "reply@example.test",
    subject: "Halo",
    html: "<p>Isi</p>",
    text: "Isi",
    attachments: [{ filename: "a.txt", content: "aGk=", content_type: "text/plain" }],
  });
});

test("the http driver turns a provider error into a coded failure the queue retries", async () => {
  const { fetch: fetchImpl } = mockFetch(() => Response.json({ message: "rate limited" }, { status: 429 }));
  const driver = createMailRegistry().create("http", { config: httpConfig, logger, fetch: fetchImpl });
  const message = resolveMail({ to: "a@example.test", subject: "Halo", text: "x" }, httpConfig);
  await expect(driver.send(message)).rejects.toMatchObject({ code: "MAIL_HTTP_429", retryable: true });

  const rejected = mockFetch(() => Response.json({ message: "bad" }, { status: 422 }));
  const strict = createMailRegistry().create("http", { config: httpConfig, logger, fetch: rejected.fetch });
  await expect(strict.send(message)).rejects.toMatchObject({ code: "MAIL_HTTP_422", retryable: false });
});

test("the http driver refuses to start without an API key or with an unknown provider", () => {
  const registry = createMailRegistry();
  expect(() => registry.create("http", { config: { ...httpConfig, MAIL_API_KEY: "" }, logger })).toThrow(
    "MAIL_API_KEY",
  );
  expect(() => registry.create("http", { config: { ...httpConfig, MAIL_HTTP_PROVIDER: "carrier" }, logger })).toThrow(
    "MAIL_HTTP_PROVIDER",
  );
});
