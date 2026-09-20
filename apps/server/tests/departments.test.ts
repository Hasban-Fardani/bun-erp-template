import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { type AppContext, resolveDefaultOrganizationId } from "../context.ts";
import { createApp } from "../http/app.ts";
import { seed } from "../platform/database/seed.ts";
import { createTestContext, truncateAll } from "./helpers.ts";

let ctx: AppContext;
let orgId: string;
let app: ReturnType<typeof createApp>;

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(async () => {
  ctx ??= await createTestContext();
  await truncateAll(ctx);
  await seed(ctx.db);
  orgId = await resolveDefaultOrganizationId(ctx.db);
  app = createApp(ctx, orgId);
});

afterAll(async () => {
  await ctx?.close();
});

describe("departments", () => {
  test("create returns envelope with requestId and uuidv7 id", async () => {
    const res = await app.request("/api/v1/departments", json({ name: "Keuangan", code: "KEU" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; code: string }; meta: { requestId: string } };
    expect(body.data.code).toBe("KEU");
    expect(body.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
    // uuidv7: byte pertama time-based
    expect(body.data.id[14]).toBe("7");
    expect(res.headers.get("x-request-id")).toBe(body.meta.requestId);
  });

  test("duplicate code is 409 conflict, not 422", async () => {
    await app.request("/api/v1/departments", json({ name: "A", code: "AAA" }));
    const res = await app.request("/api/v1/departments", json({ name: "B", code: "AAA" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  test("invalid payload is 422 with field paths", async () => {
    const res = await app.request("/api/v1/departments", json({ name: "", code: "lower" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { fields: { path: string }[] } };
    expect(body.error.fields.map((f) => f.path).sort()).toEqual(["code", "name"]);
  });

  test("unknown key is rejected (strictObject)", async () => {
    const res = await app.request("/api/v1/departments", json({ name: "A", code: "AA", organizationId: "spoof" }));
    expect(res.status).toBe(422);
  });

  test("missing id is 404 (not 403)", async () => {
    const res = await app.request("/api/v1/departments/0199aaaa-0000-7000-8000-000000000000");
    expect(res.status).toBe(404);
  });

  test("list is scoped to organization", async () => {
    await app.request("/api/v1/departments", json({ name: "A", code: "AA" }));
    const res = await app.request("/api/v1/departments?limit=10");
    const body = (await res.json()) as { data: { items: { organizationId: string }[]; total: number } };
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]?.organizationId).toBe(orgId);
  });

  test("unknown route returns NOT_FOUND envelope", async () => {
    const res = await app.request("/api/v1/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("patch updates and returns 404 when absent", async () => {
    const created = await app.request("/api/v1/departments", json({ name: "A", code: "AA" }));
    const { data } = (await created.json()) as { data: { id: string } };
    const patched = await app.request(`/api/v1/departments/${data.id}`, json({ name: "B" }, "PATCH"));
    expect(patched.status).toBe(200);
    const missing = await app.request(
      "/api/v1/departments/0199aaaa-0000-7000-8000-000000000000",
      json({ name: "B" }, "PATCH"),
    );
    expect(missing.status).toBe(404);
  });
});
