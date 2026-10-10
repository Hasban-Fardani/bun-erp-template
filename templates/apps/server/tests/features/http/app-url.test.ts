import { describe, expect, test } from "bun:test";
import { loadEnv } from "@/config/index.ts";

const base: Record<string, string> = {
  APP_NAME: "Loom Template",
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
  DATABASE_URL: "postgresql://user:pass@db.example.test:5432/erp",
  DATABASE_SSL_MODE: "require",
  BETTER_AUTH_URL: "https://auth.example.test",
  BETTER_AUTH_SECRET: "x".repeat(40),
  AUTH_TRUSTED_ORIGINS: "https://auth.example.test",
  STORAGE_DRIVER: "s3",
  MAIL_DRIVER: "log",
  MAIL_FROM_ADDRESS: "no-reply@example.test",
  MAIL_FROM_NAME: "Loom Template",
};

const withAppUrl = (APP_URL: string) => () => loadEnv({ ...base, APP_URL });

describe("production APP_URL", () => {
  test("rejects a hostname that only starts with localhost", () => {
    expect(withAppUrl("http://localhost.evil.com")).toThrow(/public URL must use https/);
    expect(withAppUrl("http://localhost@evil.com")).toThrow(/public URL must use https/);
  });

  test("rejects plain http on a public host", () => {
    expect(withAppUrl("http://erp.example.test")).toThrow(/public URL must use https/);
  });

  test("allows plain http on loopback hosts", () => {
    expect(withAppUrl("http://localhost:3000")).not.toThrow();
    expect(withAppUrl("http://127.0.0.1:3000")).not.toThrow();
    expect(withAppUrl("http://[::1]:3000")).not.toThrow();
  });

  test("allows https anywhere", () => {
    expect(withAppUrl("https://x.example")).not.toThrow();
  });
});
