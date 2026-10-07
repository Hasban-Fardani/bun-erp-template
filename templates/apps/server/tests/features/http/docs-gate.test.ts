import { beforeEach, describe, expect, test } from "bun:test";
import { loadEnv } from "../../../config/index.ts";
import { createApp } from "../../../http/app.ts";
import { createSeededApp, type SeededApp } from "../../support/fixtures.ts";

let fixture: SeededApp;

beforeEach(async () => {
  fixture = await createSeededApp();
});

/** Minimal raw environment for the config tests; only the keys the schema requires. */
const rawBase: Record<string, string> = {
  APP_NAME: "Docs Gate",
  APP_ENV: "test",
  APP_URL: "http://localhost:3000",
  APP_PORT: "3000",
  APP_RELEASE: "test",
  APP_TIMEZONE: "UTC",
  LOG_DRIVER: "console",
  LOG_LEVEL: "info",
  LOG_PATH: ".data/logs/test.log",
  LOG_RETENTION_DAYS: "1",
  LOG_MAX_SIZE_MB: "1",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/erp_test_p1a",
  BETTER_AUTH_URL: "http://localhost:3000",
  STORAGE_DRIVER: "local",
  MAIL_DRIVER: "log",
  MAIL_FROM_ADDRESS: "no-reply@example.test",
  MAIL_FROM_NAME: "Docs Gate",
};

const productionBase: Record<string, string> = {
  ...rawBase,
  APP_ENV: "production",
  APP_URL: "https://example.test",
  BETTER_AUTH_URL: "https://example.test",
  BETTER_AUTH_SECRET: "x".repeat(40),
  STORAGE_DRIVER: "s3",
};

describe("documentation exposure", () => {
  test("documentation routes disappear when the config gate is off", async () => {
    expect((await fixture.app.request("/api/docs")).status).toBe(200);
    expect((await fixture.app.request("/api/openapi.json")).status).toBe(200);

    const disabled = createApp({ ...fixture.ctx, env: { ...fixture.ctx.env, apiDocsEnabled: false } });
    expect((await disabled.request("/api/docs")).status).toBe(404);
    expect((await disabled.request("/api/openapi.json")).status).toBe(404);
  });

  test("docs are on outside production and off by default in production", () => {
    expect(loadEnv(rawBase).apiDocsEnabled).toBe(true);
    expect(loadEnv(productionBase).apiDocsEnabled).toBe(false);
  });

  test("an explicit API_DOCS_ENABLED wins in either direction", () => {
    expect(loadEnv({ ...rawBase, API_DOCS_ENABLED: "false" }).apiDocsEnabled).toBe(false);
    expect(loadEnv({ ...productionBase, API_DOCS_ENABLED: "true" }).apiDocsEnabled).toBe(true);
  });
});
