import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { type AppContext, resolveDefaultOrganizationId } from "../context.ts";
import { createApp } from "../http/app.ts";
import { seed } from "../platform/database/seed.ts";
import { createTestContext, loginOwner, truncateAll } from "./helpers.ts";

let ctx: AppContext;
let orgId: string;
let app: ReturnType<typeof createApp>;
let cookie = "";

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify(body),
});

beforeEach(async () => {
  ctx ??= await createTestContext();
  await truncateAll(ctx);
  await seed(ctx.db);
  orgId = await resolveDefaultOrganizationId(ctx.db);
  app = createApp(ctx, orgId);
  cookie = await loginOwner(app, ctx.db);
});

afterAll(async () => {
  await ctx?.close();
});

describe("users CRUD", () => {
  test("anonymous caller is rejected before any business logic runs", async () => {
    const res = await app.request("/api/v1/users", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("owner creates a user with initial password and role; new user can sign in", async () => {
    const res = await app.request(
      "/api/v1/users",
      json({ name: "Ayu", email: "Ayu@Example.test", password: "sandi-yang-panjang", roleKey: "staff" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; email: string; roles: { key: string }[] } };
    expect(body.data.email).toBe("ayu@example.test");
    expect(body.data.roles.map((r) => r.key)).toContain("staff");

    const signIn = await app.request(
      "/api/v1/auth/sign-in/email",
      json({ email: "ayu@example.test", password: "sandi-yang-panjang" }),
    );
    expect(signIn.status).toBe(200);
  });

  test("duplicate email is a conflict, not a 500", async () => {
    const first = await app.request(
      "/api/v1/users",
      json({ name: "A", email: "dup@test.dev", password: "sandi-yang-panjang" }),
    );
    expect(first.status).toBe(200);
    const second = await app.request(
      "/api/v1/users",
      json({ name: "B", email: "dup@test.dev", password: "sandi-yang-panjang" }),
    );
    expect(second.status).toBe(409);
  });

  test("unknown roleKey is a 404 with a clear message", async () => {
    const res = await app.request(
      "/api/v1/users",
      json({ name: "A", email: "role-missing@test.dev", password: "sandi-yang-panjang", roleKey: "tidak-ada" }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("tidak-ada");
  });

  test("validation rejects short password and unknown fields", async () => {
    const res = await app.request(
      "/api/v1/users",
      json({ name: "A", email: "x@test.dev", password: "pendek", extra: 1 }),
    );
    expect(res.status).toBe(422);
  });

  test("owner updates a user name via PATCH", async () => {
    const created = await app.request(
      "/api/v1/users",
      json({ name: "Lama", email: "lama@test.dev", password: "sandi-yang-panjang" }),
    );
    const { data } = (await created.json()) as { data: { id: string } };
    const res = await app.request(`/api/v1/users/${data.id}`, json({ name: "Baru" }, "PATCH"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { name: string } };
    expect(body.data.name).toBe("Baru");
  });

  test("owner deletes a user; sessions die with them; audit keeps the trail", async () => {
    const created = await app.request(
      "/api/v1/users",
      json({ name: "Hapus", email: "hapus@test.dev", password: "sandi-yang-panjang" }),
    );
    const { data } = (await created.json()) as { data: { id: string } };

    const del = await app.request(`/api/v1/users/${data.id}`, { method: "DELETE", headers: { cookie } });
    expect(del.status).toBe(200);

    const signIn = await app.request(
      "/api/v1/auth/sign-in/email",
      json({ email: "hapus@test.dev", password: "sandi-yang-panjang" }),
    );
    expect(signIn.status).toBe(401);

    const audit = await app.request("/api/v1/audit-logs?perPage=50", { headers: { cookie } });
    const list = (await audit.json()) as { data: { items: { event: string; subjectId: string | null }[] } };
    const events = list.data.items.filter((i) => i.subjectId === data.id).map((i) => i.event);
    expect(events).toContain("user.created");
    expect(events).toContain("user.deleted");
  });

  test("deleting yourself is rejected", async () => {
    const me = await app.request("/api/v1/me", { headers: { cookie } });
    const { data } = (await me.json()) as { data: { userId: string } };
    const res = await app.request(`/api/v1/users/${data.userId}`, { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(409);
  });
});
