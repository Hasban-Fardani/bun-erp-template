import { describe, expect, test } from "bun:test";
import { loadEnv } from "../../config/index.ts";

/**
 * F3.3 Phase 7 — target parity. These guards are the schema's half of "safe on Bun/VPS and safe on
 * Cloudflare": a combination that would be unsafe on either target must be refused at boot.
 */
const base: Record<string, string> = {
  APP_NAME: "Bun ERP Template",
  APP_ENV: "production",
  APP_URL: "https://erp.example.test",
  APP_PORT: "3000",
  APP_RELEASE: "test",
  APP_TIMEZONE: "UTC",
  LOG_DRIVER: "console",
  LOG_LEVEL: "info",
  LOG_PATH: "/dev/stdout",
  LOG_RETENTION_DAYS: "14",
  LOG_MAX_SIZE_MB: "100",
  TRUST_PROXY: "false",
  DATABASE_DRIVER: "postgres",
  DATABASE_URL: "postgresql://user:pass@db.example.test:5432/erp",
  DATABASE_POOL_MAX: "10",
  DATABASE_SSL_MODE: "require",
  BETTER_AUTH_URL: "https://erp.example.test",
  BETTER_AUTH_SECRET: "x".repeat(40),
  AUTH_TRUSTED_ORIGINS: "https://erp.example.test",
  STORAGE_DRIVER: "s3",
  MAIL_DRIVER: "log",
  MAIL_FROM_ADDRESS: "no-reply@example.test",
  MAIL_FROM_NAME: "Bun ERP Template",
};

const env = (overrides: Record<string, string>) => loadEnv({ ...base, ...overrides });

describe("target parity guards", () => {
  test("production on Bun refuses DATABASE_SSL_MODE=disable", () => {
    expect(() => env({ DATABASE_SSL_MODE: "disable" })).toThrow(/disable is refused in production/);
  });

  test("Cloudflare may disable TLS because Hyperdrive terminates it", () => {
    const loaded = env({ APP_DEPLOY_TARGET: "cloudflare", APP_WEB_MODE: "integrated", DATABASE_SSL_MODE: "disable" });
    expect(loaded.DATABASE_SSL_MODE).toBe("disable");
  });

  test("a non-development environment refuses an empty BETTER_AUTH_SECRET", () => {
    expect(() => env({ APP_ENV: "test", BETTER_AUTH_SECRET: "" })).toThrow(/must not be empty outside development/);
    expect(() => env({ BETTER_AUTH_SECRET: "" })).toThrow(/must not be empty outside development/);
  });

  test("development may run without a secret", () => {
    expect(env({ APP_ENV: "development", BETTER_AUTH_SECRET: "" }).BETTER_AUTH_SECRET).toBe("");
  });

  test("production refuses a non-https BETTER_AUTH_URL even when it is trusted", () => {
    expect(() => env({ BETTER_AUTH_URL: "http://erp.example.test" })).toThrow(/must use https in production/);
  });
});
