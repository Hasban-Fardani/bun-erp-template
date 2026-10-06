import { describe, expect, test } from "bun:test";
import { createDevelopmentEnvironment } from "../../cli/lib/development-environment.ts";

const baseConfig = {
  APP_NAME: "Bun ERP Template",
  APP_ENV: "development",
  APP_URL: "http://localhost:3000",
  APP_PORT: "3000",
  APP_RELEASE: "test",
  APP_TIMEZONE: "UTC",
  LOG_DRIVER: "console",
  LOG_LEVEL: "info",
  LOG_PATH: ".data/logs/app.log",
  LOG_RETENTION_DAYS: "7",
  LOG_MAX_SIZE_MB: "10",
  DATABASE_DRIVER: "postgres",
  DATABASE_URL: "postgresql://local.test/bun-erp",
  DATABASE_POOL_MAX: "10",
  DATABASE_SSL_MODE: "disable",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "",
  AUTH_TRUSTED_ORIGINS: "",
  STORAGE_DRIVER: "local",
  MAIL_DRIVER: "log",
  MAIL_FROM_ADDRESS: "no-reply@example.test",
  MAIL_FROM_NAME: "Bun ERP Template",
};

const createEnvironment = (overrides: Record<string, string> = {}) =>
  createDevelopmentEnvironment({ ...baseConfig, ...overrides });

describe("local development environment", () => {
  test("HMR keeps the configured database connection shared with CLI commands", async () => {
    const environment = createEnvironment({
      HOME: "/tmp/test-home",
      DEV_API_PORT: "3011",
      DEV_WEB_PORT: "5174",
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "postgresql://local.test/bun-erp",
    });

    expect(environment.apiPort).toBe(3011);
    expect(environment.webUrl).toBe("http://localhost:5174");
    expect(environment.server.APP_ENV).toBe("development");
    expect(environment.server.APP_PORT).toBe("3011");
    expect(environment.server.DATABASE_DRIVER).toBe("postgres");
    expect(environment.server.DATABASE_URL).toBe("postgresql://local.test/bun-erp");
    expect(environment.server.BETTER_AUTH_URL).toBe(environment.webUrl);
    expect(environment.web.API_PORT).toBe("3011");
  });

  test("the development server refuses a production-labeled database configuration", async () => {
    expect(() =>
      createEnvironment({
        APP_ENV: "production",
        APP_URL: "https://example.test",
        BETTER_AUTH_URL: "https://example.test",
        BETTER_AUTH_SECRET: "a-valid-production-secret-with-more-than-32-characters",
        STORAGE_DRIVER: "s3",
      }),
    ).toThrow("Refusing to start `bun dev` with APP_ENV=production");
  });

  test("invalid local ports fail before starting either process", async () => {
    expect(() => createEnvironment({ DEV_API_PORT: "70000" })).toThrow(
      "DEV_API_PORT must be an integer from 1 to 65535",
    );
  });

  test("incomplete configuration fails instead of silently falling back to .env.example", () => {
    expect(() => createDevelopmentEnvironment({ APP_ENV: "development" })).toThrow("Invalid environment configuration");
  });
});
