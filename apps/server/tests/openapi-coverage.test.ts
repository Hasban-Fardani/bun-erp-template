import { afterAll, beforeEach, expect, test } from "bun:test";
import { type AppContext, resolveDefaultOrganizationId } from "../context.ts";
import { createApp } from "../http/app.ts";
import { documentedRoutes } from "../http/openapi.ts";
import { seed } from "../platform/database/seed.ts";
import { createTestContext, truncateAll } from "./helpers.ts";

let ctx: AppContext;

beforeEach(async () => {
  ctx ??= await createTestContext();
  await truncateAll(ctx);
  await seed(ctx.db);
});

afterAll(async () => {
  await ctx?.close();
});

/** Route framework yang bukan bisnis: bikin bising tanpa nilai dokumentasi. */
const IGNORED = [
  /^ALL \/\*/,
  /^ALL \/api\/\*/,
  /^GET \/api\/v1\/auth\//,
  /^POST \/api\/v1\/auth\//,
  /^GET \/api\/docs/,
];

test("setiap route bisnis terdaftar punya entri dokumentasi API", async () => {
  const app = createApp(ctx, await resolveDefaultOrganizationId(ctx.db));
  const registered = app.routes
    .filter((r) => !IGNORED.some((re) => re.test(`${r.method} ${r.path}`)))
    .map((r) => `${r.method} ${r.path}`)
    // /api/openapi.json mendokumentasikan dirinya sendiri lewat endpoint docs.
    .filter((k) => k !== "GET /api/openapi.json");

  const missing = registered.filter((k) => !documentedRoutes.includes(k));
  expect(missing).toEqual([]);
});

test("spesifikasi memuat path CRUD user lengkap", async () => {
  const app = createApp(ctx, await resolveDefaultOrganizationId(ctx.db));
  const spec = (await (await app.request("/api/openapi.json")).json()) as {
    paths: Record<string, Record<string, unknown>>;
  };
  expect(Object.keys(spec.paths)).toContain("/api/v1/users");
  const users = spec.paths["/api/v1/users"];
  const userById = spec.paths["/api/v1/users/{id}"];
  expect(Object.keys(users ?? {})).toEqual(expect.arrayContaining(["get", "post"]));
  expect(Object.keys(userById ?? {})).toEqual(expect.arrayContaining(["get", "patch", "delete"]));
});
