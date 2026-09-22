import { afterAll, beforeEach, expect, test } from "bun:test";
import { type AppContext, resolveDefaultOrganizationId } from "../context.ts";
import { createApp } from "../http/app.ts";
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

type Operation = { responses?: Record<string, unknown>; summary?: string };
type Spec = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, unknown> } };

const spec = async (): Promise<Spec> => {
  const app = createApp(ctx, await resolveDefaultOrganizationId(ctx.db));
  return (await (await app.request("/api/openapi.json")).json()) as Spec;
};

/**
 * Route yang bukan kontrak bisnis: handler Better Auth (`/auth/*`) dimiliki library dan
 * operasinya didokumentasikan eksplisit di `http/openapi.ts`, jadi wildcard-nya diabaikan.
 */
const IGNORED = [
  /^ALL \/\*/,
  /^ALL \/api\/\*/,
  /^GET \/api\/docs/,
  /^GET \/api\/openapi\.json/,
  /^(GET|POST) \/api\/v1\/auth\/\*$/,
];

const normalize = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

test("setiap route bisnis terdaftar punya operasi di spesifikasi", async () => {
  const app = createApp(ctx, await resolveDefaultOrganizationId(ctx.db));
  const dokumentasi = await spec();

  const missing = app.routes
    .filter((r) => !IGNORED.some((re) => re.test(`${r.method} ${r.path}`)))
    .map((r) => {
      const path = normalize(r.path);
      const method = r.method === "ALL" ? "" : r.method.toLowerCase();
      return { label: `${r.method} ${path}`, method, path };
    })
    .filter(({ method, path }) => !(dokumentasi.paths[path] && method in dokumentasi.paths[path]))
    .map(({ label }) => label);

  expect(missing).toEqual([]);
});

test("spesifikasi memuat path auth yang dipakai aplikasi", async () => {
  const paths = Object.keys((await spec()).paths);
  expect(paths).toContain("/api/v1/auth/sign-in/email");
  expect(paths).toContain("/api/v1/auth/sign-out");
  expect(paths).toContain("/api/v1/auth/get-session");
});

test("spesifikasi memuat path CRUD user & role lengkap", async () => {
  const paths = (await spec()).paths;
  expect(Object.keys(paths["/api/v1/users"] ?? {})).toEqual(expect.arrayContaining(["get", "post"]));
  expect(Object.keys(paths["/api/v1/users/{id}"] ?? {})).toEqual(expect.arrayContaining(["get", "patch", "delete"]));
  expect(Object.keys(paths["/api/v1/roles/{id}"] ?? {})).toEqual(expect.arrayContaining(["patch", "delete"]));
  expect(paths["/api/v1/roles/{id}/permissions"]?.put).toBeDefined();
});

test("respons 401/403/422 tertulis di operasi", async () => {
  const rolePatch = (await spec()).paths["/api/v1/roles/{id}"]?.patch;
  expect(Object.keys(rolePatch?.responses ?? {})).toEqual(expect.arrayContaining(["200", "401", "403", "422"]));
});

test("izin yang ditegakkan terlihat di spesifikasi, bukan tersembunyi", async () => {
  const ops = (await spec()).paths;
  const withPermission = ["/api/v1/roles/{id}", "/api/v1/users/{id}", "/api/v1/departments/{id}"].map(
    (p) => (ops[p] as Record<string, Record<string, unknown>>)?.patch?.["x-permission"],
  );
  expect(withPermission).toEqual(["role.update", "user.update", "department.update"]);
});

test("skema body diturunkan dari zod — bukan salinan yang bisa basi", async () => {
  const paths = (await spec()).paths;
  const bodyOf = (path: string, method: string) =>
    (paths[path]?.[method] as { requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> } })
      ?.requestBody?.content?.["application/json"]?.schema;

  // Batasan zod asli harus muncul apa adanya: password min 10, key role ber-pola.
  const createUser = bodyOf("/api/v1/users", "post") as { properties?: Record<string, { minLength?: number }> };
  expect(createUser.properties?.password?.minLength).toBe(10);

  const createRole = bodyOf("/api/v1/roles", "post") as { properties?: Record<string, { pattern?: string }> };
  expect(createRole.properties?.key?.pattern).toBe("^[a-z0-9_-]+$");
});
