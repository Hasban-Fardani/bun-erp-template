import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "./helpers.ts";

let api: HttpFixture;
let { app } = {} as HttpFixture;
let cookie = "";

const json = (body: unknown, method = "POST"): RequestInit => api.json(body, method);

const listRoles = async () => {
  const res = await app.request("/api/v1/roles", { headers: { cookie } });
  const body = (await res.json()) as {
    data: { items: { id: string; key: string; isSystem: boolean; permissions: string[] }[] };
  };
  return body.data.items;
};

beforeEach(async () => {
  api = await createHttpFixture();
  ({ app } = api);
  cookie = await api.signInAsOwner();
});

afterAll(async () => {
  await api?.close();
});

describe("roles CRUD", () => {
  test("anonymous caller is rejected before any business logic runs", async () => {
    const res = await app.request("/api/v1/roles", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("owner creates a custom role, renames it, and assigns permissions that take effect", async () => {
    const created = await app.request("/api/v1/roles", json({ key: "auditor", name: "Auditor", description: "Baca" }));
    expect(created.status).toBe(200);
    const role = ((await created.json()) as { data: { id: string; isSystem: boolean } }).data;
    expect(role.isSystem).toBe(false);

    const renamed = await app.request(`/api/v1/roles/${role.id}`, json({ name: "Auditor Internal" }, "PATCH"));
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { data: { name: string } }).data.name).toBe("Auditor Internal");

    const granted = await app.request(
      `/api/v1/roles/${role.id}/permissions`,
      json({ permissions: ["audit.read"] }, "PUT"),
    );
    expect(granted.status).toBe(200);
    const listed = (await listRoles()).find((r) => r.id === role.id);
    expect(listed?.permissions).toEqual(["audit.read"]);
  });

  test("replacing permissions revokes what is left out — the catalog is not additive", async () => {
    const created = await app.request("/api/v1/roles", json({ key: "auditor", name: "Auditor" }));
    const role = ((await created.json()) as { data: { id: string } }).data;
    await app.request(
      `/api/v1/roles/${role.id}/permissions`,
      json({ permissions: ["audit.read", "user.read"] }, "PUT"),
    );
    await app.request(`/api/v1/roles/${role.id}/permissions`, json({ permissions: ["audit.read"] }, "PUT"));
    const listed = (await listRoles()).find((r) => r.id === role.id);
    expect(listed?.permissions).toEqual(["audit.read"]);
  });

  test("custom role is deleted; system role is refused", async () => {
    const created = await app.request("/api/v1/roles", json({ key: "auditor", name: "Auditor" }));
    const role = ((await created.json()) as { data: { id: string } }).data;
    const removed = await app.request(`/api/v1/roles/${role.id}`, { method: "DELETE", headers: { cookie } });
    expect(removed.status).toBe(200);

    const system = (await listRoles()).find((r) => r.isSystem);
    const refused = await app.request(`/api/v1/roles/${system?.id}`, { method: "DELETE", headers: { cookie } });
    expect(refused.status).toBe(409);
    expect((await refused.json()) as { error: { message: string } }).toMatchObject({
      error: { message: "Role sistem tidak bisa dihapus" },
    });
  });

  test("duplicate key is a conflict, not a silent overwrite", async () => {
    await app.request("/api/v1/roles", json({ key: "auditor", name: "Auditor" }));
    const again = await app.request("/api/v1/roles", json({ key: "auditor", name: "Auditor Lain" }));
    expect(again.status).toBe(409);
  });

  test("unknown permission is refused, and a role in use cannot be deleted", async () => {
    const created = await app.request("/api/v1/roles", json({ key: "auditor", name: "Auditor" }));
    const role = ((await created.json()) as { data: { id: string } }).data;

    const bogus = await app.request(
      `/api/v1/roles/${role.id}/permissions`,
      json({ permissions: ["tidak.ada"] }, "PUT"),
    );
    expect(bogus.status).toBe(422);

    // A custom role in use: deleting it revokes people's access, so it must be refused.
    const users = await app.request("/api/v1/users?perPage=5", { headers: { cookie } });
    const target = ((await users.json()) as { data: { items: { id: string }[] } }).data.items[0];
    const assigned = await app.request(`/api/v1/users/${target?.id}/roles`, json({ roleKey: "auditor" }));
    expect(assigned.status).toBe(200);

    const refused = await app.request(`/api/v1/roles/${role.id}`, { method: "DELETE", headers: { cookie } });
    expect(refused.status).toBe(409);
    expect((await refused.json()) as { error: { message: string } }).toMatchObject({
      error: { message: "Role masih dipakai pengguna" },
    });
  });

  test("audit trail records the role changes", async () => {
    const created = await app.request("/api/v1/roles", json({ key: "auditor", name: "Auditor" }));
    const role = ((await created.json()) as { data: { id: string } }).data;
    await app.request(`/api/v1/roles/${role.id}/permissions`, json({ permissions: ["audit.read"] }, "PUT"));
    await app.request(`/api/v1/roles/${role.id}`, { method: "DELETE", headers: { cookie } });

    const res = await app.request("/api/v1/audit-logs?perPage=50", { headers: { cookie } });
    const body = (await res.json()) as { data: { items: { event: string; subjectId: string }[] } };
    const events = body.data.items.filter((l) => l.subjectId === role.id).map((l) => l.event);
    expect(events).toContain("role.created");
    expect(events).toContain("role.permissions_set");
    expect(events).toContain("role.deleted");
  });
});
