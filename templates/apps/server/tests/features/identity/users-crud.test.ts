import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
});

afterAll(async () => {
  await api?.close();
});

describe("users CRUD", () => {
  test("anonymous caller is rejected before any business logic runs", async () => {
    // Bodyless POST with no cookie: the typed client requires a `json` payload, so a raw request
    // is the only way to prove that a request without one is still rejected as 401.
    const res = await api.app.request("/api/v1/users", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("owner creates a user with initial password and role; new user can sign in", async () => {
    const res = await api.client.api.v1.users.$post({
      json: { name: "Ayu", email: "Ayu@Example.test", password: "sandi-yang-panjang", roleKey: "staff" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; email: string; roles: { key: string }[] } };
    expect(body.data.email).toBe("ayu@example.test");
    expect(body.data.roles.map((r) => r.key)).toContain("staff");

    // Better Auth wildcard route: /api/v1/auth/* is proxied, so the typed client cannot address it.
    const signIn = await api.app.request(
      "/api/v1/auth/sign-in/email",
      json({ email: "ayu@example.test", password: "sandi-yang-panjang" }),
    );
    expect(signIn.status).toBe(200);
  });

  test("duplicate email is a conflict, not a 500", async () => {
    const first = await api.client.api.v1.users.$post({
      json: { name: "A", email: "dup@test.dev", password: "sandi-yang-panjang" },
    });
    expect(first.status).toBe(200);
    const second = await api.client.api.v1.users.$post({
      json: { name: "B", email: "dup@test.dev", password: "sandi-yang-panjang" },
    });
    expect(second.status).toBe(409);
  });

  test("unknown roleKey is a 404 with a clear message", async () => {
    const res = await api.client.api.v1.users.$post({
      json: { name: "A", email: "role-missing@test.dev", password: "sandi-yang-panjang", roleKey: "tidak-ada" },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("tidak-ada");
  });

  test("validation rejects short password and unknown fields", async () => {
    // `extra` is outside the typed input; the variable sidesteps the excess-property check because
    // rejection at runtime is exactly what is under test.
    const payload = { name: "A", email: "x@test.dev", password: "pendek", extra: 1 };
    const res = await api.client.api.v1.users.$post({ json: payload });
    expect(res.status).toBe(422);
  });

  test("owner updates a user name via PATCH", async () => {
    const created = await api.client.api.v1.users.$post({
      json: { name: "Lama", email: "lama@test.dev", password: "sandi-yang-panjang" },
    });
    const { data } = (await created.json()) as { data: { id: string } };
    const res = await api.client.api.v1.users[":id"].$patch({ param: { id: data.id }, json: { name: "Baru" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { name: string } };
    expect(body.data.name).toBe("Baru");
  });

  test("owner deletes a user; sessions die with them; audit keeps the trail", async () => {
    const created = await api.client.api.v1.users.$post({
      json: { name: "Hapus", email: "hapus@test.dev", password: "sandi-yang-panjang" },
    });
    const { data } = (await created.json()) as { data: { id: string } };

    const del = await api.client.api.v1.users[":id"].$delete({ param: { id: data.id } });
    expect(del.status).toBe(200);

    // Better Auth wildcard route: /api/v1/auth/* is proxied, so the typed client cannot address it.
    const signIn = await api.app.request(
      "/api/v1/auth/sign-in/email",
      json({ email: "hapus@test.dev", password: "sandi-yang-panjang" }),
    );
    expect(signIn.status).toBe(401);

    const audit = await api.client.api.v1["audit-logs"].$get({ query: { perPage: "50" } });
    const list = (await audit.json()) as { data: { items: { event: string; subjectId: string | null }[] } };
    const events = list.data.items.filter((i) => i.subjectId === data.id).map((i) => i.event);
    expect(events).toContain("user.created");
    expect(events).toContain("user.deleted");
  });

  test("deleting yourself is rejected", async () => {
    const me = await api.client.api.v1.me.$get();
    const { data } = (await me.json()) as { data: { userId: string } };
    const res = await api.client.api.v1.users[":id"].$delete({ param: { id: data.userId } });
    expect(res.status).toBe(409);
  });

  test("a malformed user id is 422, not 500", async () => {
    const get = await api.app.request("/api/v1/users/not-a-uuid", { headers: { cookie: api.cookie } });
    expect(get.status).toBe(422);
    const del = await api.app.request("/api/v1/users/not-a-uuid", {
      method: "DELETE",
      headers: { cookie: api.cookie },
    });
    expect(del.status).toBe(422);
    const roles = await api.app.request("/api/v1/users/not-a-uuid/roles", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: api.cookie },
      body: JSON.stringify({ roleKey: "staff" }),
    });
    expect(roles.status).toBe(422);
  });

  test("two concurrent creates with the same email yield one 200 and one 409", async () => {
    const payload = { name: "Race", email: "race@test.dev", password: "sandi-yang-panjang" };
    const [first, second] = await Promise.all([
      api.client.api.v1.users.$post({ json: payload }),
      api.client.api.v1.users.$post({ json: payload }),
    ]);
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
  });

  test("two concurrent role assignments yield one 200 and one 409", async () => {
    const created = await api.client.api.v1.users.$post({
      json: { name: "Race", email: "race-role@test.dev", password: "sandi-yang-panjang" },
    });
    const { data } = (await created.json()) as { data: { id: string } };
    const assign = () =>
      api.client.api.v1.users[":id"].roles.$post({ param: { id: data.id }, json: { roleKey: "staff" } });
    const [first, second] = await Promise.all([assign(), assign()]);
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
  });
});
