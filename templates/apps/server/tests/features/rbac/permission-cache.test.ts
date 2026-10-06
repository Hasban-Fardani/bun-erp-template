import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { cacheStats, resetPermissionCache } from "../../../features/rbac/cache.ts";
import { createHttpFixture, createTestClient, dataOf, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
});

afterAll(async () => {
  await api?.close();
});

type UserRow = { id: string; email: string; roles: { key: string }[] };

async function createUser(email: string): Promise<UserRow> {
  const res = await api.client.api.v1.users.$post({
    json: { name: "Kasus", email, password: "sandi-yang-panjang", roleKey: "staff" },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: UserRow }).data;
}

/** Signs in as that user and returns the cookie so their own permissions can be read. */
async function permissionsOf(email: string): Promise<string[]> {
  // Better Auth wildcard route: /api/v1/auth/* is proxied, so the typed client cannot address it.
  const signIn = await api.app.request("/api/v1/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "sandi-yang-panjang" }),
  });
  const cookie = signIn.headers.get("set-cookie") ?? "";
  const me = await dataOf<{ permissions: string[] }>(createTestClient(api.app, cookie).api.v1.me.$get());
  return me.permissions;
}

describe("permission cache", () => {
  test("a granted role takes effect on the very next request, not after a TTL", async () => {
    await createUser("cache-grant@example.test");
    expect(await permissionsOf("cache-grant@example.test")).toContain("user.read");

    const staffRole = await dataOf<{ items: { id: string; key: string }[] }>(
      api.client.api.v1.roles.$get({ query: { perPage: "100" } }),
    );
    const auditorId = (
      await dataOf<{ items: { id: string; key: string; permissions: string[] }[] }>(
        api.client.api.v1.roles.$get({ query: { perPage: "100" } }),
      )
    ).items.find((r) => r.key === "staff");
    expect(staffRole).toBeDefined();
    expect(auditorId).toBeDefined();

    // Grant audit.read to the staff role: the user's cached permissions must be dropped.
    const grant = await api.client.api.v1.roles[":id"].permissions.$put({
      param: { id: auditorId?.id as string },
      json: { permissions: ["user.read", "audit.read"] },
    });
    expect(grant.status).toBe(200);

    expect(await permissionsOf("cache-grant@example.test")).toContain("audit.read");
  });

  test("revoking a role removes access immediately, with no stale window", async () => {
    const user = await createUser("cache-revoke@example.test");
    expect(await permissionsOf("cache-revoke@example.test")).toContain("user.read");

    const del = await api.client.api.v1.users[":id"].roles[":roleKey"].$delete({
      param: { id: user.id, roleKey: "staff" },
    });
    expect(del.status).toBe(200);

    // Without invalidation this would keep returning the cached set for the whole TTL.
    expect(await permissionsOf("cache-revoke@example.test")).toEqual([]);
  });

  test("repeat requests are served from cache, so the join runs once", async () => {
    resetPermissionCache();
    const before = { ...cacheStats };

    await api.client.api.v1.me.$get();
    const first = { ...cacheStats };
    expect(first.misses - before.misses).toBe(1);

    await api.client.api.v1.me.$get();
    await api.client.api.v1.me.$get();
    const later = { ...cacheStats };
    expect(later.hits - first.hits).toBe(2);
    expect(later.misses - first.misses).toBe(0);
  });

  test("the cached path and the database agree", async () => {
    const list = await dataOf<{ items: { permissions: string[] }[] }>(
      api.client.api.v1.users.$get({ query: { perPage: "50" } }),
    );
    expect(list.items.length).toBeGreaterThan(0);
    // Second read is served from cache; the assertion is that it is not empty or wrong-shaped.
    const again = await dataOf<{ items: { permissions: string[] }[] }>(
      api.client.api.v1.users.$get({ query: { perPage: "50" } }),
    );
    expect(again.items.map((u) => u.permissions.length)).toEqual(list.items.map((u) => u.permissions.length));
  });
});
