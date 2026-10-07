import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { roles } from "@/features/rbac/schema.ts";
import { createHttpFixture, createTestClient, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
});

afterAll(async () => {
  await api?.close();
});

type UserRow = { id: string; email: string };

async function roleIdByKey(key: string): Promise<string> {
  const rows = await api.ctx.db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
  if (!rows[0]) throw new Error(`role missing: ${key}`);
  return rows[0].id;
}

/** Creates a user through the owner's session. */
async function createUser(email: string, roleKey = "staff"): Promise<UserRow> {
  const res = await api.client.api.v1.users.$post({
    json: { name: email.split("@")[0] ?? "User", email, password: "sandi-yang-panjang", roleKey },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: UserRow }).data;
}

/** Signs in and returns a typed client carrying that user's cookie. */
async function signInAs(email: string) {
  const signIn = await api.app.request("/api/v1/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "sandi-yang-panjang" }),
  });
  expect(signIn.status).toBe(200);
  const cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] as string;
  return createTestClient(api.app, cookie);
}

/** A non-owner admin holding the given permissions, plus a session. */
async function createDelegate(permissions = ["user.read", "user.create", "user.delete", "role.assign", "role.read"]) {
  const created = await api.client.api.v1.roles.$post({ json: { key: "delegate", name: "Delegate" } });
  expect(created.status).toBe(200);
  const role = ((await created.json()) as { data: { id: string } }).data;
  const set = await api.client.api.v1.roles[":id"].permissions.$put({ param: { id: role.id }, json: { permissions } });
  expect(set.status).toBe(200);

  await createUser("delegate@example.test", "delegate");
  return { client: await signInAs("delegate@example.test") };
}

async function myUserId(): Promise<string> {
  const me = await api.client.api.v1.me.$get();
  return ((await me.json()) as { data: { userId: string } }).data.userId;
}

/** Owner grants the owner role to a user; the caller asserts the outcome. */
async function grantOwner(userId: string) {
  return api.client.api.v1.users[":id"].roles.$post({ param: { id: userId }, json: { roleKey: "owner" } });
}

describe("privilege-escalation guards", () => {
  test("a role.assign holder who is not an owner cannot grant owner", async () => {
    const { client } = await createDelegate();
    const target = await createUser("target-grant@example.test");

    const res = await client.api.v1.users[":id"].roles.$post({ param: { id: target.id }, json: { roleKey: "owner" } });
    expect(res.status).toBe(403);
  });

  test("a role.assign holder who is not an owner cannot revoke owner", async () => {
    const { client } = await createDelegate();
    const second = await createUser("second-owner@example.test");
    const grant = await grantOwner(second.id);
    expect(grant.status).toBe(200);

    const res = await client.api.v1.users[":id"].roles[":roleKey"].$delete({
      param: { id: second.id, roleKey: "owner" },
    });
    expect(res.status).toBe(403);
  });

  test("a user.create holder cannot create a user with the owner role", async () => {
    const { client } = await createDelegate();

    const res = await client.api.v1.users.$post({
      json: { name: "Ghost", email: "ghost-owner@example.test", password: "sandi-yang-panjang", roleKey: "owner" },
    });
    expect(res.status).toBe(403);
  });

  test("an owner can grant and revoke owner while another owner remains", async () => {
    const second = await createUser("second-owner@example.test");
    const grant = await grantOwner(second.id);
    expect(grant.status).toBe(200);

    const revoke = await api.client.api.v1.users[":id"].roles[":roleKey"].$delete({
      param: { id: second.id, roleKey: "owner" },
    });
    expect(revoke.status).toBe(200);
  });

  test("the last owner cannot revoke their own owner role", async () => {
    const id = await myUserId();
    const res = await api.client.api.v1.users[":id"].roles[":roleKey"].$delete({
      param: { id, roleKey: "owner" },
    });
    expect(res.status).toBe(409);
  });

  test("the last owner cannot be demoted by replacing their roles", async () => {
    const id = await myUserId();
    const res = await api.client.api.v1.users[":id"].roles.$put({ param: { id }, json: { roleKeys: ["staff"] } });
    expect(res.status).toBe(409);
  });

  test("the last owner cannot be deleted", async () => {
    const { client } = await createDelegate();
    const id = await myUserId();

    const res = await client.api.v1.users[":id"].$delete({ param: { id } });
    expect(res.status).toBe(409);
  });

  test("a system role's permission set cannot be emptied", async () => {
    for (const key of ["owner", "staff"]) {
      const res = await api.client.api.v1.roles[":id"].permissions.$put({
        param: { id: await roleIdByKey(key) },
        json: { permissions: [] },
      });
      expect(res.status).toBe(409);
    }
  });
});
