import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { type AppContext, createContext, resolveDefaultOrganizationId } from "../context.ts";
import { createApp } from "../http/app.ts";
import { resetPermissionCache } from "../modules/rbac/cache.ts";
import { roles } from "../modules/rbac/data.ts";
import { assignRole } from "../modules/rbac/service.ts";
import type { Env } from "../platform/config/index.ts";
import { loadEnv } from "../platform/config/index.ts";
import { rowsOf } from "../platform/database/migrate.ts";
import { seed } from "../platform/database/seed.ts";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../migrations");

/** Test env: PGlite in memory, no `.data` files that can leak between tests. */
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

/** Each test file gets its own clean database — migrations run at the start. */
export async function createTestContext(): Promise<AppContext> {
  return createContext({ env: testEnv, migrationsDir: MIGRATIONS_DIR });
}

export async function truncateAll(ctx: AppContext): Promise<void> {
  const rows = await ctx.db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '_migrations'`,
  );
  const tables = rowsOf<{ tablename: string }>(rows).map((r) => r.tablename);
  if (tables.length === 0) return;
  await ctx.db.execute(sql.raw(`truncate table ${tables.map((t) => `"${t}"`).join(", ")} restart identity cascade`));
}

/**
 * Standard fixture for HTTP tests: clean database, seeded RBAC, an app instance and an
 * owner cookie. Extracted because five test files had grown byte-identical copies — the
 * slop gate flagged them, and a fix to one copy could silently miss the others.
 *
 * Returns a `json()` helper that carries the cookie so request bodies stay one-liners.
 */
export type HttpFixture = Awaited<ReturnType<typeof createHttpFixture>>;

export async function createHttpFixture() {
  const ctx = await createTestContext();
  // The permission cache is process-wide, so a fixture from a previous file could otherwise
  // hand this file a stale permission set for the same user id.
  resetPermissionCache();
  await truncateAll(ctx);
  await seed(ctx.db);
  const organizationId = await resolveDefaultOrganizationId(ctx.db);

  let cookie = "";
  const app = createApp(ctx, organizationId);

  const api = {
    ctx,
    app,
    organizationId,
    get cookie() {
      return cookie;
    },
    /** Signs in as the seeded owner. Call after seeding org-specific data if order matters. */
    async signInAsOwner() {
      cookie = await loginOwner(app, ctx.db);
      return cookie;
    },
    json(body: unknown, method = "POST"): RequestInit {
      return {
        method,
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(body),
      };
    },
    async get<T>(path: string): Promise<{ data: T }> {
      const res = await app.request(path, { headers: { cookie } });
      return (await res.json()) as { data: T };
    },
    close: () => ctx.close(),
  };

  return api;
}

/**
 * Logs in a full-scope admin through the real Better Auth path, then returns
 * its cookie. Business tests need this because every private route now sits behind RBAC.
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

/** Creates a user through real Better Auth; returns its id. */
export async function signUpUser(app: ReturnType<typeof createApp>, email: string): Promise<{ id: string }> {
  const res = await app.request("/api/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "sandi-yang-panjang", name: email.split("@")[0] ?? "User" }),
  });
  if (res.status !== 200) throw new Error(`sign-up gagal: ${res.status}`);
  const { user } = (await res.json()) as { user: { id: string } };
  return user;
}
