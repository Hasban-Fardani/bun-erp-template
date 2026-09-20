import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { type AppContext, createContext } from "../context.ts";
import type { createApp } from "../http/app.ts";
import { roles } from "../modules/rbac/data.ts";
import { assignRole } from "../modules/rbac/service.ts";
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

/**
 * Login admin bercakup penuh lewat jalur Better Auth yang sesungguhnya, lalu mengembalikan
 * cookie-nya. Test bisnis butuh ini karena semua route privat sekarang di balik RBAC.
 */
export async function loginOwner(app: ReturnType<typeof createApp>, db: AppContext["db"]): Promise<string> {
  const signUp = await app.request("/api/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.test", password: "sandi-yang-panjang", name: "Admin" }),
  });
  if (signUp.status !== 200) throw new Error(`sign-up gagal: ${signUp.status}`);
  const { user } = (await signUp.json()) as { user: { id: string } };

  const owner = (await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "owner")).limit(1))[0];
  if (!owner) throw new Error("role owner tidak ada — seed belum jalan?");
  await assignRole(db, { userId: user.id, roleId: owner.id });

  const signIn = await app.request("/api/v1/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.test", password: "sandi-yang-panjang" }),
  });
  if (signIn.status !== 200) throw new Error(`sign-in gagal: ${signIn.status}`);

  const setCookie = signIn.headers.get("set-cookie");
  if (!setCookie) throw new Error("tidak ada cookie sesi");
  return setCookie.split(";")[0] as string;
}
