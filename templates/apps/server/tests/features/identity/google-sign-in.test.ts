import { beforeEach, describe, expect, test } from "bun:test";
import { testClient } from "hono/testing";
import type { AppContext } from "@/bootstrap/context.ts";
import { loadEnv } from "@/config/index.ts";
import { createAuth } from "@/features/identity/auth.ts";
import { createApp } from "@/http/app.ts";
import { createSeededContext, testEnv } from "../../support/fixtures.ts";

const google = { GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "client-secret" };
const authUrl = (path: string) => `${testEnv.BETTER_AUTH_URL}/api/v1/auth${path}`;

function postJson(path: string, body: unknown): Request {
  return new Request(authUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let ctx: AppContext;

beforeEach(async () => {
  ctx = await createSeededContext();
});

describe("Google sign-in configuration", () => {
  const base: Record<string, string> = {
    APP_NAME: "Bun ERP Template",
    APP_ENV: "development",
    APP_PORT: "3000",
    APP_RELEASE: "test",
    APP_TIMEZONE: "UTC",
    LOG_DRIVER: "console",
    LOG_LEVEL: "info",
    LOG_PATH: "/dev/stdout",
    LOG_RETENTION_DAYS: "14",
    LOG_MAX_SIZE_MB: "100",
    STORAGE_DRIVER: "memory",
    APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/erp",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "x".repeat(40),
    MAIL_FROM_ADDRESS: "no-reply@example.test",
    MAIL_FROM_NAME: "Bun ERP Template",
    MAIL_DRIVER: "log",
  };
  const raw = (overrides: Record<string, string>) => loadEnv({ ...base, ...overrides });

  test("Google-only needs both Google credentials", () => {
    expect(() => raw({ AUTH_PASSWORD_ENABLED: "false", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" })).toThrow(
      /AUTH_PASSWORD_ENABLED/,
    );
    expect(raw({ AUTH_PASSWORD_ENABLED: "false", ...google }).AUTH_PASSWORD_ENABLED).toBe(false);
  });

  test("a single Google credential is refused", () => {
    expect(() => raw({ GOOGLE_CLIENT_ID: "only-the-id", GOOGLE_CLIENT_SECRET: "" })).toThrow(/together/);
  });
});

describe("auth options and Google-only sign-in", () => {
  test("GET /auth-options reports the enabled sign-in methods without a session", async () => {
    const client = testClient(createApp({ ...ctx, env: { ...ctx.env, ...google, AUTH_PASSWORD_ENABLED: false } }));
    const res = await client.api.v1["auth-options"].$get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ password: false, google: true });

    const defaults = testClient(createApp(ctx));
    expect((await (await defaults.api.v1["auth-options"].$get()).json()).data).toEqual({
      password: true,
      google: false,
    });
  });

  test("Google-only refuses email/password sign-in", async () => {
    const auth = createAuth({ ...testEnv, ...google, AUTH_PASSWORD_ENABLED: false }, ctx.db);
    const res = await auth.handler(
      postJson("/sign-in/email", { email: "owner@example.test", password: "sandi-yang-panjang" }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("Google sign-in returns the Google consent URL", async () => {
    const auth = createAuth({ ...testEnv, ...google }, ctx.db);
    const res = await auth.handler(postJson("/sign-in/social", { provider: "google", callbackURL: "/" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url?: string };
    expect(body.url).toStartWith("https://accounts.google.com/");
  });
});
