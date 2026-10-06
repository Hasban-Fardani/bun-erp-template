import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

const listRoles = async () => {
  const res = await api.client.api.v1.roles.$get({ query: {} });
  const body = (await res.json()) as {
    data: { items: { id: string; key: string; isSystem: boolean; permissions: string[] }[] };
  };
  return body.data.items;
};

beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
});

afterAll(async () => {
  await api?.close();
});

/** Deleting a role is asserted twice (system role, role in use), so the call lives once. */
async function tryDeleteRole(id: string | undefined) {
  const res = await api.client.api.v1.roles[":id"].$delete({ param: { id: id as string } });
  return { status: res.status, body: (await res.json()) as { error: { message: string } } };
}

/** Permission replacement is asserted in three tests, so the call lives once. */
async function setPermissions(id: string, permissions: string[]) {
  return api.client.api.v1.roles[":id"].permissions.$put({ param: { id }, json: { permissions } });
}

describe("roles CRUD", () => {
  test("anonymous caller is rejected before any business logic runs", async () => {
    // Bodyless POST with no cookie: the typed client requires a `json` payload, so a raw request
    // is the only way to prove that a request without one is still rejected as 401.
    const res = await api.app.request("/api/v1/roles", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("owner creates a custom role, renames it, and assigns permissions that take effect", async () => {
    const created = await api.client.api.v1.roles.$post({
      json: { key: "auditor", name: "Auditor", description: "Baca" },
    });
    expect(created.status).toBe(200);
    const role = ((await created.json()) as { data: { id: string; isSystem: boolean } }).data;
    expect(role.isSystem).toBe(false);

    const renamed = await api.client.api.v1.roles[":id"].$patch({
      param: { id: role.id },
      json: { name: "Auditor Internal" },
    });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { data: { name: string } }).data.name).toBe("Auditor Internal");

    const granted = await setPermissions(role.id, ["audit.read"]);
    expect(granted.status).toBe(200);
    const listed = (await listRoles()).find((r) => r.id === role.id);
    expect(listed?.permissions).toEqual(["audit.read"]);
  });

  test("replacing permissions revokes what is left out — the catalog is not additive", async () => {
    const created = await api.client.api.v1.roles.$post({ json: { key: "auditor", name: "Auditor" } });
    const role = ((await created.json()) as { data: { id: string } }).data;
    await setPermissions(role.id, ["audit.read", "user.read"]);
    await setPermissions(role.id, ["audit.read"]);
    const listed = (await listRoles()).find((r) => r.id === role.id);
    expect(listed?.permissions).toEqual(["audit.read"]);
  });

  test("custom role is deleted; system role is refused", async () => {
    const created = await api.client.api.v1.roles.$post({ json: { key: "auditor", name: "Auditor" } });
    const role = ((await created.json()) as { data: { id: string } }).data;
    const removed = await api.client.api.v1.roles[":id"].$delete({ param: { id: role.id } });
    expect(removed.status).toBe(200);

    const system = (await listRoles()).find((r) => r.isSystem);
    const refused = await tryDeleteRole(system?.id);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { message: "Role sistem tidak bisa dihapus" } });
  });

  test("duplicate key is a conflict, not a silent overwrite", async () => {
    await api.client.api.v1.roles.$post({ json: { key: "auditor", name: "Auditor" } });
    const again = await api.client.api.v1.roles.$post({ json: { key: "auditor", name: "Auditor Lain" } });
    expect(again.status).toBe(409);
  });

  test("unknown permission is refused, and a role in use cannot be deleted", async () => {
    const created = await api.client.api.v1.roles.$post({ json: { key: "auditor", name: "Auditor" } });
    const role = ((await created.json()) as { data: { id: string } }).data;

    const bogus = await setPermissions(role.id, ["tidak.ada"]);
    expect(bogus.status).toBe(422);

    // A custom role in use: deleting it revokes people's access, so it must be refused.
    const users = await api.client.api.v1.users.$get({ query: { perPage: "5" } });
    const target = ((await users.json()) as { data: { items: { id: string }[] } }).data.items[0];
    const assigned = await api.client.api.v1.users[":id"].roles.$post({
      param: { id: target?.id as string },
      json: { roleKey: "auditor" },
    });
    expect(assigned.status).toBe(200);

    const refused = await tryDeleteRole(role.id);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { message: "Role masih dipakai pengguna" } });
  });

  test("audit trail records the role changes", async () => {
    const created = await api.client.api.v1.roles.$post({ json: { key: "auditor", name: "Auditor" } });
    const role = ((await created.json()) as { data: { id: string } }).data;
    await setPermissions(role.id, ["audit.read"]);
    await api.client.api.v1.roles[":id"].$delete({ param: { id: role.id } });

    const res = await api.client.api.v1["audit-logs"].$get({ query: { perPage: "50" } });
    const body = (await res.json()) as { data: { items: { event: string; subjectId: string }[] } };
    const events = body.data.items.filter((l) => l.subjectId === role.id).map((l) => l.event);
    expect(events).toContain("role.created");
    expect(events).toContain("role.permissions_set");
    expect(events).toContain("role.deleted");
  });
});
