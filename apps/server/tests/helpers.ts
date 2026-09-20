import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { type AppContext, createContext } from "../context.ts";
import type { Env } from "../platform/config/index.ts";
import { loadEnv } from "../platform/config/index.ts";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../migrations");

/** Env uji: PGlite di memori, tanpa file `.data` yang bisa bocor antar-test. */
export const testEnv: Env = loadEnv({
  APP_NAME: "Bun ERP Template",
  APP_ENV: "test",
  APP_URL: "http://localhost:3000",
  APP_PORT: "3000",
  APP_RELEASE: "test",
  APP_TIMEZONE: "UTC",
  LOG_DRIVER: "console",
  LOG_LEVEL: "error",
  LOG_PATH: ".data/logs/test.log",
  LOG_RETENTION_DAYS: "1",
  LOG_MAX_SIZE_MB: "1",
  TRUST_PROXY: "false",
  DATABASE_DRIVER: "pglite",
  PGLITE_PATH: "memory://",
  DATABASE_URL: "",
  DATABASE_POOL_MAX: "1",
  DATABASE_SSL_MODE: "disable",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "",
  AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_ROOT: ".data/storage",
  MAIL_DRIVER: "log",
  MAIL_FROM_ADDRESS: "no-reply@example.test",
  MAIL_FROM_NAME: "Bun ERP Template",
  SMTP_HOST: "",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USERNAME: "",
  SMTP_PASSWORD: "",
  FEATURE_ADVANCED_REPORTS: "false",
});

/** Tiap test file mendapat database bersih sendiri — migrasi dijalankan di awal. */
export async function createTestContext(): Promise<AppContext> {
  return createContext({ env: testEnv, migrationsDir: MIGRATIONS_DIR });
}

export async function truncateAll(ctx: AppContext): Promise<void> {
  const rows = await ctx.db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '_migrations'`,
  );
  const tables = (Array.isArray(rows) ? rows : (rows as { rows: { tablename: string }[] }).rows).map(
    (r) => r.tablename,
  );
  if (tables.length === 0) return;
  await ctx.db.execute(sql.raw(`truncate table ${tables.map((t) => `"${t}"`).join(", ")} restart identity cascade`));
}
