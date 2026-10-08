import { expect, test } from "bun:test";
import { createMailer, createMemoryMailDriver } from "@bun-erp/mail/server";
import { sql } from "drizzle-orm";
import { rowsOf } from "@/database/rows.ts";
import { createJobRegistry } from "@/features/jobs.ts";
import { createAppMailer, createMailEnqueue } from "@/features/mail/wiring.ts";
import { runNextJob } from "@/infra/jobs/queue.ts";
import type { Logger } from "@/infra/observability/logger.ts";
import { createFixtureUser, createHttpFixture, testEnv } from "../../support/fixtures.ts";

const logger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

const PASSWORD = "sandi-yang-panjang";
const NEW_PASSWORD = "sandi-baru-yang-panjang";

function post(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  path: string,
  body: unknown,
  cookie?: string,
) {
  return app.request(`/api/v1/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function resetJobs(db: Awaited<ReturnType<typeof createHttpFixture>>["ctx"]["db"]) {
  return rowsOf<{ id: string; idempotency_key: string; payload: { to: string } }>(
    await db.execute(sql`select id, idempotency_key, payload from background_jobs where job_name = 'mail.send'`),
  );
}

const RESET_REDIRECT = `${testEnv.APP_URL}/reset-password`;

/** The body Better Auth expects; `redirectTo` must be a trusted origin or the request is refused. */
const resetBody = (email: string) => ({ email, redirectTo: RESET_REDIRECT });

test("a reset request enqueues one durable mail job and answers like an unknown address", async () => {
  const api = await createHttpFixture();
  await createFixtureUser(api.ctx.db, "reset@example.test");

  const known = await post(api.app, "/request-password-reset", resetBody("reset@example.test"));
  const unknown = await post(api.app, "/request-password-reset", resetBody("nobody@example.test"));

  expect(known.status).toBe(200);
  expect(unknown.status).toBe(known.status);
  expect(await unknown.json()).toEqual(await known.json());
  const jobs = await resetJobs(api.ctx.db);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]?.payload.to).toBe("reset@example.test");
  expect(jobs[0]?.idempotency_key).toMatch(/^password-reset:[0-9a-f]{32}$/);
});

test("the worker mails the reset link and the token changes the password and revokes sessions", async () => {
  const api = await createHttpFixture();
  await createFixtureUser(api.ctx.db, "reset@example.test");
  const signIn = await post(api.app, "/sign-in/email", { email: "reset@example.test", password: PASSWORD });
  const cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  expect(cookie).not.toBe("");

  await post(api.app, "/request-password-reset", resetBody("reset@example.test"));
  const driver = createMemoryMailDriver();
  const mailer = createMailer({ config: api.ctx.env, logger, driver, enqueue: createMailEnqueue(api.ctx.db) });
  expect(await runNextJob(api.ctx.db, createJobRegistry({ ...api.ctx, mail: mailer }), logger)).toBe(true);

  expect(driver.sent).toHaveLength(1);
  const mail = driver.sent[0];
  expect(mail?.to).toEqual([{ address: "reset@example.test", name: "" }]);
  const link = /https?:\/\/\S+\/reset-password\/([A-Za-z0-9_-]+)/.exec(mail?.text ?? "");
  expect(link?.[1]).toBeTruthy();
  expect(mail?.html).toContain(link?.[0] ?? "missing");

  const reset = await post(api.app, "/reset-password", { token: link?.[1], newPassword: NEW_PASSWORD });
  expect(reset.status).toBe(200);
  expect((await post(api.app, "/sign-in/email", { email: "reset@example.test", password: PASSWORD })).status).toBe(401);
  expect((await post(api.app, "/sign-in/email", { email: "reset@example.test", password: NEW_PASSWORD })).status).toBe(
    200,
  );
  const stale = await api.app.request("/api/v1/me", { headers: { cookie } });
  expect(stale.status).toBe(401);

  // The token is single use: a second redemption is refused.
  expect((await post(api.app, "/reset-password", { token: link?.[1], newPassword: `${PASSWORD}x` })).status).toBe(400);
});

test("a reset for an unknown address enqueues nothing", async () => {
  const api = await createHttpFixture();
  expect((await post(api.app, "/request-password-reset", resetBody("nobody@example.test"))).status).toBe(200);
  expect(await resetJobs(api.ctx.db)).toHaveLength(0);
});

test("the composition root still builds the mailer the reset job needs", async () => {
  const api = await createHttpFixture();
  expect(createAppMailer(api.ctx.env, logger, api.ctx.db).driver).toBe(testEnv.MAIL_DRIVER);
});
