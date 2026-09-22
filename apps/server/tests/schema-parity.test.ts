import { describe, expect, test } from "bun:test";
import type * as z from "zod";
import {
  CreateDepartmentInput,
  createDepartmentSchema,
  ListDepartmentsInput,
  listDepartmentsSchema,
  UpdateDepartmentInput,
  updateDepartmentSchema,
} from "../modules/departments/schema.ts";
import { EnvRawSchema, EnvSchema } from "../platform/config/schema.ts";

/** F1.16 — hasil z.compile() harus identik dengan definisi sumber. */
type Pair = { name: string; compiled: z.ZodType; raw: z.ZodType; inputs: unknown[] };

const pairs: Pair[] = [
  {
    name: "departments.create",
    compiled: CreateDepartmentInput,
    raw: createDepartmentSchema,
    inputs: [
      { name: "Keuangan", code: "KEU" },
      { name: "", code: "lower" },
      { name: "A", code: "AA", extra: 1 },
      { name: "A", code: "AAA" },
      { code: "AA" },
      { name: "  Keuangan  ", code: " KEU " },
      {},
      null,
      "not-an-object",
    ],
  },
  {
    name: "departments.update",
    compiled: UpdateDepartmentInput,
    raw: updateDepartmentSchema,
    inputs: [{ name: "X" }, {}, { name: "" }, { code: "x" }, null],
  },
  {
    name: "departments.list",
    compiled: ListDepartmentsInput,
    raw: listDepartmentsSchema,
    inputs: [{ limit: "10", offset: "0" }, { limit: 0 }, { limit: 500 }, { unknown: true }, {}],
  },
];

describe("compiled schema parity", () => {
  for (const { name, compiled, raw, inputs } of pairs) {
    test(`${name}: compiled matches uncompiled on success, data, and issue paths`, () => {
      for (const input of inputs) {
        const a = compiled.safeParse(input);
        const b = raw.safeParse(input);
        expect({ ok: a.success, data: a.success ? a.data : undefined }).toEqual({
          ok: b.success,
          data: b.success ? b.data : undefined,
        });
        if (!a.success && !b.success) {
          expect(a.error.issues.map((i) => i.path.join("."))).toEqual(b.error.issues.map((i) => i.path.join(".")));
        }
      }
    });
  }

  test("EnvSchema compiled matches uncompiled on the .env.example shape", () => {
    const input = {
      APP_NAME: "Bun ERP Template",
      APP_ENV: "development",
      APP_URL: "http://localhost:3000",
      APP_PORT: "3000",
      APP_RELEASE: "dev",
      APP_TIMEZONE: "UTC",
      LOG_DRIVER: "console",
      LOG_LEVEL: "debug",
      LOG_PATH: ".data/logs/app.log",
      LOG_RETENTION_DAYS: "14",
      LOG_MAX_SIZE_MB: "100",
      TRUST_PROXY: "false",
      DATABASE_DRIVER: "pglite",
      BETTER_AUTH_URL: "http://localhost:3000",
      STORAGE_DRIVER: "local",
      MAIL_DRIVER: "log",
      MAIL_FROM_ADDRESS: "no-reply@example.test",
      MAIL_FROM_NAME: "Bun ERP Template",
    };
    const a = EnvSchema.safeParse(input);
    const b = EnvRawSchema.safeParse(input);
    expect(a.success).toBe(true);
    expect(a.success && b.success ? a.data : null).toEqual(b.success ? b.data : null);
  });

  test("hybrid deployment: BETTER_AUTH_URL may differ from APP_URL when trusted (ADR-0011)", () => {
    const result = EnvSchema.safeParse({
      APP_NAME: "Bun ERP Template",
      APP_ENV: "production",
      APP_URL: "https://erp.example.test",
      APP_PORT: "8095",
      APP_RELEASE: "web-1",
      APP_TIMEZONE: "Asia/Jakarta",
      LOG_DRIVER: "console",
      LOG_LEVEL: "info",
      LOG_PATH: "/var/log/bun-erp/app.log",
      LOG_RETENTION_DAYS: "14",
      LOG_MAX_SIZE_MB: "100",
      TRUST_PROXY: "true",
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "postgres://user:pass@db.internal:5432/erp",
      BETTER_AUTH_URL: "https://api.erp.example.test",
      AUTH_TRUSTED_ORIGINS: "https://erp.example.test,https://api.erp.example.test",
      STORAGE_DRIVER: "s3",
      MAIL_DRIVER: "log",
      MAIL_FROM_ADDRESS: "no-reply@example.test",
      MAIL_FROM_NAME: "Bun ERP Template",
      BETTER_AUTH_SECRET: "x".repeat(32),
    });
    expect(result.success).toBe(true);
  });

  test("hybrid deployment: BETTER_AUTH_URL di luar trusted origins tetap ditolak", () => {
    const result = EnvSchema.safeParse({
      APP_NAME: "Bun ERP Template",
      APP_ENV: "production",
      APP_URL: "https://erp.example.test",
      APP_PORT: "8095",
      APP_RELEASE: "web-1",
      APP_TIMEZONE: "Asia/Jakarta",
      LOG_DRIVER: "console",
      LOG_LEVEL: "info",
      LOG_PATH: "/var/log/bun-erp/app.log",
      LOG_RETENTION_DAYS: "14",
      LOG_MAX_SIZE_MB: "100",
      TRUST_PROXY: "true",
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "postgres://user:pass@db.internal:5432/erp",
      BETTER_AUTH_URL: "https://penyerang.example",
      AUTH_TRUSTED_ORIGINS: "https://erp.example.test",
      STORAGE_DRIVER: "s3",
      MAIL_DRIVER: "log",
      MAIL_FROM_ADDRESS: "no-reply@example.test",
      MAIL_FROM_NAME: "Bun ERP Template",
      BETTER_AUTH_SECRET: "x".repeat(32),
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("BETTER_AUTH_URL");
  });

  test("production guard rejects debug logging, local storage, and short secret", () => {
    const result = EnvSchema.safeParse({
      APP_NAME: "Bun ERP Template",
      APP_ENV: "production",
      APP_URL: "https://erp.example.test",
      APP_PORT: "3000",
      APP_RELEASE: "v1",
      APP_TIMEZONE: "UTC",
      LOG_DRIVER: "console",
      LOG_LEVEL: "debug",
      LOG_PATH: "/var/log/bun-erp/app.log",
      LOG_RETENTION_DAYS: "14",
      LOG_MAX_SIZE_MB: "100",
      DATABASE_DRIVER: "pglite",
      BETTER_AUTH_URL: "https://erp.example.test",
      STORAGE_DRIVER: "local",
      MAIL_DRIVER: "log",
      MAIL_FROM_ADDRESS: "no-reply@example.test",
      MAIL_FROM_NAME: "Bun ERP Template",
      BETTER_AUTH_SECRET: "short",
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("LOG_LEVEL");
    expect(paths).toContain("STORAGE_DRIVER");
    expect(paths).toContain("BETTER_AUTH_SECRET");
  });

  test("postgres driver requires DATABASE_URL", () => {
    const result = EnvSchema.safeParse({
      APP_NAME: "Bun ERP Template",
      APP_ENV: "development",
      APP_URL: "http://localhost:3000",
      APP_PORT: "3000",
      APP_RELEASE: "dev",
      APP_TIMEZONE: "UTC",
      LOG_DRIVER: "console",
      LOG_LEVEL: "debug",
      LOG_PATH: ".data/logs/app.log",
      LOG_RETENTION_DAYS: "14",
      LOG_MAX_SIZE_MB: "100",
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "",
      BETTER_AUTH_URL: "http://localhost:3000",
      STORAGE_DRIVER: "local",
      MAIL_DRIVER: "log",
      MAIL_FROM_ADDRESS: "no-reply@example.test",
      MAIL_FROM_NAME: "Bun ERP Template",
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("DATABASE_URL");
  });
});
