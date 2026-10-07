import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { testClient } from "hono/testing";
import { createContext } from "../../bootstrap/bootstrap.ts";
import type { AppContext } from "../../bootstrap/context.ts";
import type { Env } from "../../config/index.ts";
import { loadEnv, testDatabaseUrl } from "../../config/index.ts";
import { rowsOf } from "../../database/migrate.ts";
import { seed } from "../../database/seed.ts";
import { createUser } from "../../features/identity/service.ts";
import { resetPermissionCache } from "../../features/rbac/cache.ts";
import { roles } from "../../features/rbac/schema.ts";
import { assignRole } from "../../features/rbac/service.ts";
import { createApp } from "../../http/app.ts";
import type { AppType } from "../../http/app-type.ts";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../../database/migrations");
const databaseUrl = testDatabaseUrl();
if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required; run tests with a disposable PostgreSQL database, never production data.",
  );
}

/** Tests use the runner's isolated, disposable PostgreSQL database. */
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
  DATABASE_DRIVER: "postgres",
  DATABASE_URL: databaseUrl,
  // 2 lets the unique-constraint race tests actually overlap on two connections; 1 would serialize them.
  DATABASE_POOL_MAX: "2",
  DATABASE_SSL_MODE: "disable",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "",
  AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
  // Public self sign-up is off by default; tests that exercise it opt in explicitly (auth-hardening).
  AUTH_SIGNUP_ENABLED: "false",
  // Rate limits would share one bucket across the suite; the rate-limit tests enable it per instance.
  AUTH_RATE_LIMIT_ENABLED: "false",
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

/**
 * One migrated database per test *process*, reused by every file.
 *
 * Creating a context runs all migrations from scratch: ~3.1s. Eleven files meant the suite
 * spent ~35s building identical schemas. A fresh context per file bought nothing — every
 * fixture already truncates and reseeds — so the schema is built once and the data is reset.
 */
let shared: Promise<AppContext> | undefined;

export async function createTestContext(): Promise<AppContext> {
  shared ??= createContext({ env: testEnv, migrationsDir: MIGRATIONS_DIR, migrateOnStart: true });
  return shared;
}

/** Drops the shared database. Only the migration tests need this, to build their own schema. */
export async function disposeTestContext(): Promise<void> {
  if (!shared) return;
  const context = await shared;
  // Real PostgreSQL persists functions after disconnect; only the runner's scratch DB may reset.
  const databaseName = new URL(context.env.DATABASE_URL).pathname;
  if (!databaseName.startsWith("/erp_test_")) throw new Error("Refusing to reset a non-test database");
  await context.db.execute(sql`drop schema public cascade`);
  await context.db.execute(sql`create schema public`);
  await context.close();
  shared = undefined;
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
 * `client` is the typed `hono/testing` client; the cookie is applied through the client's
 * request options, so authenticated calls need no per-call headers.
 */
export type HttpFixture = Awaited<ReturnType<typeof createHttpFixture>>;
export type SeededApp = Awaited<ReturnType<typeof createSeededApp>>;

/**
 * Typed RPC client over a fixture app. `AppType` is the same contract the web client binds to,
 * so error envelopes are typed next to success bodies. Hono 4's signature is
 * `testClient(app, Env, executionCtx, options)`; `options` is the fourth argument and its
 * `headers` are merged into every call.
 */
export function createTestClient(app: ReturnType<typeof createApp>, cookie?: string) {
  return testClient(app as AppType, undefined, undefined, cookie ? { headers: { cookie } } : undefined);
}

/** Unwraps the `{ data }` success envelope from a typed client response. */
export async function dataOf<T>(response: Promise<{ json(): Promise<unknown> }>): Promise<T> {
  return ((await (await response).json()) as { data: T }).data;
}

/**
 * Clean, seeded context for service-level tests that need no HTTP app. The fixture lifecycle is
 * shared so tests cannot drift into slightly different "clean database" definitions.
 */
export async function createSeededContext(): Promise<AppContext> {
  const ctx = await createTestContext();
  await truncateAll(ctx);
  await seed(ctx.db);
  return ctx;
}

/**
 * For tests that exercise the app itself (routes, CORS, the OpenAPI document) rather than
 * permissions: a clean, seeded database and an app instance, with no session.
 */
export async function createSeededApp() {
  const ctx = await createSeededContext();
  resetPermissionCache();
  const app = createApp(ctx);
  return { ctx, app, client: createTestClient(app), close: async () => {} };
}

export async function createHttpFixture() {
  const ctx = await createTestContext();
  // The permission cache is process-wide, so a fixture from a previous file could otherwise
  // hand this file a stale permission set for the same user id.
  resetPermissionCache();
  await truncateAll(ctx);
  await seed(ctx.db);

  let cookie = "";
  const app = createApp(ctx);

  const api = {
    ctx,
    app,
    get cookie() {
      return cookie;
    },
    /**
     * Typed client for authenticated calls. Rebuilt on access so it carries the cookie
     * `signInAsOwner` set; before sign-in it sends none, which is what anonymous cases want.
     */
    get client() {
      return createTestClient(app, cookie || undefined);
    },
    /** Signs in as the seeded owner. Call after seeding org-specific data if order matters. */
    async signInAsOwner() {
      cookie = await loginOwner(app, ctx.db);
      return cookie;
    },
    /** Data and cache are reset between tests; the shared schema is not. */
    close: async () => {},
  };

  return api;
}

/**
 * Logs in a full-scope admin through the real Better Auth sign-in path, then returns its cookie.
 * The account is created through the same service `bun erp user:create` uses, so the fixture keeps
 * working while public self sign-up is disabled (AUTH_SIGNUP_ENABLED=false).
 */
export async function loginOwner(app: ReturnType<typeof createApp>, db: AppContext["db"]): Promise<string> {
  const owner = (await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "owner")).limit(1))[0];
  if (!owner) throw new Error("role owner tidak ada — seed belum jalan?");
  const user = await createUser(
    db,
    { name: "Admin", email: "admin@example.test", password: "sandi-yang-panjang" },
    { userId: null, traceId: "fixture-owner", label: "fixture" },
  );
  await assignRole(db, { userId: user.id, roleId: owner.id });

  // Better Auth wildcard route: /api/v1/auth/* is proxied through one handler, so the typed client cannot address it.
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

/** Creates a second user through the CLI service path; returns its id. */
export async function createFixtureUser(db: AppContext["db"], email: string): Promise<{ id: string }> {
  const user = await createUser(
    db,
    { name: email.split("@")[0] ?? "User", email, password: "sandi-yang-panjang" },
    { userId: null, traceId: "fixture-user", label: "fixture" },
  );
  return { id: user.id };
}
