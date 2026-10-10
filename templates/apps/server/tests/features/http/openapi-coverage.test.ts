import { afterAll, beforeEach, expect, test } from "bun:test";
import { createSeededApp, type SeededApp } from "../../support/fixtures.ts";

let fixture: SeededApp;

beforeEach(async () => {
  fixture = await createSeededApp();
});

afterAll(async () => {
  await fixture?.close();
});

type Operation = { responses?: Record<string, unknown>; summary?: string };
type Spec = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, unknown> } };

const spec = async (): Promise<Spec> => {
  const app = fixture.app;
  // OpenAPI document fetch: raw by design, it is the generated document rather than a typed route.
  return (await (await app.request("/api/openapi.json")).json()) as Spec;
};

/**
 * Routes that are not business contracts: Better Auth handlers (`/auth/*`) are owned by the
 * library and their operations are documented explicitly in `http/openapi.ts`, so the wildcard is skipped.
 */
const IGNORED = [
  /^ALL \/\*/,
  /^ALL \/api\/\*/,
  /^GET \/api\/docs/,
  /^GET \/api\/openapi\.json/,
  /^(GET|POST) \/api\/v1\/auth\/\*$/,
];

// `:key{.+}` is a Hono regex parameter; the spec names it `{key}` without the pattern.
const normalize = (path: string) => path.replace(/:([A-Za-z0-9_]+)(?:\{[^}]*\})?/g, "{$1}");

test("setiap route bisnis terdaftar punya operasi di spesifikasi", async () => {
  const app = fixture.app;
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
  const withPermission = ["/api/v1/roles/{id}", "/api/v1/users/{id}", "/api/v1/audit-logs"].map(
    (p) =>
      (ops[p] as Record<string, Record<string, unknown>>)?.patch?.["x-permission"] ??
      (ops[p] as Record<string, Record<string, unknown>>)?.get?.["x-permission"],
  );
  expect(withPermission).toEqual(["role.update", "user.update", "audit.read"]);
});

test("skema body diturunkan dari zod — bukan salinan yang bisa basi", async () => {
  const paths = (await spec()).paths;
  const bodyOf = (path: string, method: string) =>
    (paths[path]?.[method] as { requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> } })
      ?.requestBody?.content?.["application/json"]?.schema;

  // The real zod constraints must appear verbatim: password min 10, role key patterned.
  const createUser = bodyOf("/api/v1/users", "post") as { properties?: Record<string, { minLength?: number }> };
  expect(createUser.properties?.password?.minLength).toBe(10);

  const createRole = bodyOf("/api/v1/roles", "post") as { properties?: Record<string, { pattern?: string }> };
  expect(createRole.properties?.key?.pattern).toBe("^[a-z0-9_-]+$");
});

test("global request ID and CORS also cover documentation routes", async () => {
  const origin = fixture.ctx.env.trustedOrigins[0];
  if (!origin) throw new Error("Test fixture requires a trusted origin");
  // OpenAPI document fetch with CORS/request-id headers: same raw document call as `spec()`.
  const response = await fixture.app.request("/api/openapi.json", {
    headers: { "x-request-id": "docs-request", origin },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("x-request-id")).toBe("docs-request");
  expect(response.headers.get("access-control-allow-origin")).toBe(origin);
});

test("Scalar reference remains at /api/docs and points to the OpenAPI document", async () => {
  // Documentation HTML: not part of the typed JSON API contract.
  const response = await fixture.app.request("/api/docs");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");

  const html = await response.text();
  expect(html).toContain("Loom Template API");
  expect(html).toContain("/api/openapi.json");
});

test("HEAD uses GET headers and status while omitting the body", async () => {
  const headers = { "x-request-id": "head-request" };
  // Method-contract baseline for the HEAD check below; both stay raw as a pair.
  const get = await fixture.app.request("/api/v1/health", { headers });
  // HEAD has no typed client method; the test pins GET/HEAD parity on the same route.
  const head = await fixture.app.request("/api/v1/health", { method: "HEAD", headers });
  expect(head.status).toBe(get.status);
  expect(head.headers.get("x-request-id")).toBe(get.headers.get("x-request-id"));
  expect(head.headers.get("content-type")).toBe(get.headers.get("content-type"));
  expect(head.body).toBeNull();
});
