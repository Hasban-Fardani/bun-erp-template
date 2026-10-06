import { beforeEach, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../../bootstrap/context.ts";
import { permissions, rolePermissions, roles } from "../../../features/rbac/schema.ts";
import { permissionsForRole, seedRbac } from "../../../features/rbac/service.ts";
import { createSeededContext } from "../../support/fixtures.ts";

let ctx: AppContext;

beforeEach(async () => {
  ctx = await createSeededContext();
});

async function roleByKey(key: string) {
  const rows = await ctx.db.select().from(roles).where(eq(roles.key, key)).limit(1);
  const role = rows[0];
  if (!role) throw new Error(`role not seeded: ${key}`);
  return role;
}

async function permissionByKey(key: string) {
  const rows = await ctx.db.select().from(permissions).where(eq(permissions.key, key)).limit(1);
  const permission = rows[0];
  if (!permission) throw new Error(`permission not seeded: ${key}`);
  return permission;
}

/**
 * A boot seed must reconcile the code definition into the database, not overwrite the database
 * with the code definition: admin edits to system-role permissions have to survive a restart.
 */
test("admin permission edits survive the next boot seed", async () => {
  const staff = await roleByKey("staff");
  const owner = await roleByKey("owner");
  const auditRead = await permissionByKey("audit.read");
  const userCreate = await permissionByKey("user.create");

  // Admin grants staff a permission the code definition does not include.
  await ctx.db.insert(rolePermissions).values({ roleId: staff.id, permissionId: auditRead.id });
  // Admin revokes a permission the code definition does include from owner.
  await ctx.db
    .delete(rolePermissions)
    .where(and(eq(rolePermissions.roleId, owner.id), eq(rolePermissions.permissionId, userCreate.id)));

  await seedRbac(ctx.db);

  // The admin's extra grant is not deleted by the seed...
  expect(await permissionsForRole(ctx.db, staff.id)).toContain("audit.read");
  // ...and a code-defined permission that was missing is inserted again.
  expect(await permissionsForRole(ctx.db, owner.id)).toContain("user.create");
});

test("a system role never ends a seed without its code-defined permissions", async () => {
  const owner = await roleByKey("owner");
  await seedRbac(ctx.db);

  const held = await permissionsForRole(ctx.db, owner.id);
  const catalogue = (await ctx.db.select({ key: permissions.key }).from(permissions)).map((row) => row.key);
  expect(held.sort()).toEqual(catalogue.sort());
});
