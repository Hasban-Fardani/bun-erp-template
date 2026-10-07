import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../../bootstrap/context.ts";
import { createUser } from "../../../features/identity/service.ts";
import { roles } from "../../../features/rbac/schema.ts";
import {
  assignRole,
  permissionsForRole,
  permissionsForRoles,
  rolesForUser,
  rolesForUsers,
} from "../../../features/rbac/service.ts";
import { createSeededContext } from "../../support/fixtures.ts";

let ctx: AppContext;

const actor = { userId: null, traceId: "test", label: "test" } as const;

beforeEach(async () => {
  ctx = await createSeededContext();
});

async function roleIdByKey(key: string): Promise<string> {
  const rows = await ctx.db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
  if (!rows[0]) throw new Error(`role missing: ${key}`);
  return rows[0].id;
}

test("permissionsForRoles batches the per-role permission lookup", async () => {
  const staff = await roleIdByKey("staff");
  const owner = await roleIdByKey("owner");

  const batched = await permissionsForRoles(ctx.db, [staff, owner]);
  expect(batched.get(staff)).toEqual(["user.read"]);
  expect((batched.get(owner) ?? []).length).toBeGreaterThan(0);
  expect(await permissionsForRole(ctx.db, staff)).toEqual(["user.read"]);

  // An empty id list must not hit the database or invent entries.
  expect((await permissionsForRoles(ctx.db, [])).size).toBe(0);
});

test("rolesForUsers batches role assignments per user", async () => {
  const first = await createUser(
    ctx.db,
    { name: "A", email: "batch-a@example.test", password: "sandi-yang-panjang" },
    actor,
  );
  const second = await createUser(
    ctx.db,
    { name: "B", email: "batch-b@example.test", password: "sandi-yang-panjang" },
    actor,
  );
  await assignRole(ctx.db, { userId: first.id, roleId: await roleIdByKey("staff") });
  await assignRole(ctx.db, { userId: second.id, roleId: await roleIdByKey("owner") });

  const batched = await rolesForUsers(ctx.db, [first.id, second.id]);
  expect(batched.get(first.id)?.map((role) => role.key)).toEqual(["staff"]);
  expect(batched.get(second.id)?.map((role) => role.key)).toEqual(["owner"]);
  expect((await rolesForUser(ctx.db, first.id)).map((role) => role.key)).toEqual(["staff"]);

  expect((await rolesForUsers(ctx.db, [])).size).toBe(0);
});
