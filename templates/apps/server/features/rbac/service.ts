import { and, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { ApiError } from "../../http/helpers/errors.ts";
import { toOffset } from "../../http/helpers/list-query.ts";
import { orderByColumn } from "../../http/helpers/sort.ts";
import { auditChange, snapshot } from "../audit/index.ts";
import { invalidateAll, readCachedPermissions, writeCachedPermissions } from "./cache.ts";
import { permissions, rolePermissions, roles, userRoles } from "./schema.ts";
import { allPermissions, type PermissionKey, type SystemRoleKey, systemRoles } from "./statements.ts";
import type { ListRolesInput } from "./validation.ts";

export type Role = typeof roles.$inferSelect;

/** Loads one role inside a transaction; shared by delete and permission-set so the lookup cannot drift. */
async function requireRoleInTx(tx: Pick<Database, "select">, id: string): Promise<Role> {
  const rows = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
  const role = rows[0];
  if (!role) throw ApiError.notFound("Role not found");
  return role;
}

/** Syncs the permission catalogue + system roles from code; idempotent, one transaction. */
export async function seedRbac(db: Database): Promise<{ permissions: number; roles: number }> {
  return db.transaction(async (tx) => {
    await tx
      .insert(permissions)
      .values(allPermissions.map((key) => ({ key })))
      .onConflictDoNothing({ target: permissions.key });

    // Permissions retired from code leave the catalogue; their role_permissions rows cascade.
    await tx.delete(permissions).where(notInArray(permissions.key, [...allPermissions]));

    const permissionRows = await tx.select({ id: permissions.id, key: permissions.key }).from(permissions);
    const idByKey = new Map(permissionRows.map((r) => [r.key, r.id]));

    let roleCount = 0;
    for (const [key, definition] of Object.entries(systemRoles) as [
      SystemRoleKey,
      (typeof systemRoles)[SystemRoleKey],
    ][]) {
      const rows = await tx
        .insert(roles)
        .values({
          key,
          name: definition.name,
          description: definition.description,
          isSystem: true,
        })
        .onConflictDoUpdate({
          target: roles.key,
          set: { name: definition.name, description: definition.description, isSystem: true, updatedAt: new Date() },
        })
        .returning({ id: roles.id });

      const roleId = rows[0]?.id;
      if (!roleId) continue;
      roleCount += 1;

      const wanted = definition.permissions
        .map((p) => idByKey.get(p))
        .filter((id): id is string => typeof id === "string");

      // Insert only what is missing: admin edits survive a restart, while permissions added to
      // the code definition still propagate on the next boot. Deleting first would leave the role
      // empty for a concurrent replica and would wipe every admin grant.
      if (wanted.length > 0) {
        await tx
          .insert(rolePermissions)
          .values(wanted.map((permissionId) => ({ roleId, permissionId })))
          .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.permissionId] });
      }
    }

    return { permissions: permissionRows.length, roles: roleCount };
  });
}

/** Union of permissions across all of a user's roles. Per-record filtering is the module policy's job. */
export async function permissionsForUser(db: Database, userId: string): Promise<PermissionKey[]> {
  const cached = readCachedPermissions(userId);
  if (cached) return [...cached];

  const rows = await db
    .selectDistinct({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  const resolved = rows.map((r) => r.key) as PermissionKey[];
  writeCachedPermissions(userId, resolved);
  return resolved;
}

/**
 * Roles for MANY users in one query; `rolesForUser` is the single-user wrapper. The CLI list
 * used to run one lookup per row, which is an N+1 the moment a real directory exists.
 */
export async function rolesForUsers(db: Database, userIds: readonly string[]) {
  const byUser = new Map<string, { roleId: string; key: string; name: string }[]>();
  if (userIds.length === 0) return byUser;

  const rows = await db
    .select({
      userId: userRoles.userId,
      roleId: roles.id,
      key: roles.key,
      name: roles.name,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, [...userIds]));

  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ roleId: row.roleId, key: row.key, name: row.name });
    byUser.set(row.userId, list);
  }
  return byUser;
}

/** Roles a user holds — the UI uses this to render the current assignment. */
export async function rolesForUser(db: Database, userId: string) {
  return (await rolesForUsers(db, [userId])).get(userId) ?? [];
}

/** Does the user hold this role key? The privilege-escalation guards branch on it. */
export async function userHoldsRoleKey(db: Database, userId: string, roleKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(roles.key, roleKey)))
    .limit(1);
  return rows.length > 0;
}

/** How many users hold this role key? One owner may be demoted; the last one may not. */
export async function countUsersWithRoleKey(db: Database, roleKey: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(distinct ${userRoles.userId})::int` })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.key, roleKey));
  return rows[0]?.total ?? 0;
}

/**
 * Roles stay small in practice, but the contract is the same as every other collection so a
 * client never has to special-case this endpoint. Permissions are attached by the route.
 */
export async function listRoles(db: Database, input: ListRolesInput): Promise<{ items: Role[]; total: number }> {
  const where = input.search
    ? or(ilike(roles.key, `%${input.search}%`), ilike(roles.name, `%${input.search}%`))
    : undefined;
  const [items, count] = await Promise.all([
    db
      .select()
      .from(roles)
      .where(where)
      .orderBy(...orderByColumn(roles, input.sort, input.dir))
      .limit(input.perPage)
      .offset(toOffset(input).offset),
    db.select({ total: sql<number>`count(*)::int` }).from(roles).where(where),
  ]);

  return { items, total: count[0]?.total ?? 0 };
}

/** Permission sets for MANY roles in one query; `permissionsForRole` is the single-role wrapper. */
export async function permissionsForRoles(db: Database, roleIds: readonly string[]): Promise<Map<string, string[]>> {
  const byRole = new Map<string, string[]>();
  if (roleIds.length === 0) return byRole;

  const rows = await db
    .select({ roleId: rolePermissions.roleId, key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(inArray(rolePermissions.roleId, [...roleIds]));

  for (const row of rows) {
    const list = byRole.get(row.roleId) ?? [];
    list.push(row.key);
    byRole.set(row.roleId, list);
  }
  for (const list of byRole.values()) list.sort();
  return byRole;
}

/** Permission catalogue a role holds, used by the UI to render checkboxes. */
export async function permissionsForRole(db: Database, roleId: string): Promise<string[]> {
  return (await permissionsForRoles(db, [roleId])).get(roleId) ?? [];
}

/** Inserts the role row and its audit event inside the caller's transaction. */
async function insertRole(
  tx: Database,
  input: { key: string; name: string; description?: string },
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<Role> {
  const clash = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, input.key)).limit(1);
  if (clash.length > 0) throw ApiError.conflict("Role key already exists", "key");

  const rows = await tx
    .insert(roles)
    .values({ key: input.key, name: input.name, description: input.description ?? "" })
    .returning();
  const role = rows[0] as Role;

  await auditChange(tx, {
    actor,
    event: "role.created",
    subject: { type: "role", id: role.id },
    after: snapshot("role", role as unknown as Record<string, unknown>),
  });
  return role;
}

/**
 * Creates a custom role. System roles come from code and are not created here —
 * one that diverges from the `statements` definition loses at the next seed.
 */
export async function createRole(
  db: Database,
  input: { key: string; name: string; description?: string },
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<Role> {
  return db.transaction((tx) => insertRole(tx as unknown as Database, input, actor));
}

/**
 * Creates a role and its initial permission set in ONE transaction: an unknown permission key
 * must not leave a half-created role behind (`role:create --permissions`).
 */
export async function createRoleWithPermissions(
  db: Database,
  input: { key: string; name: string; description?: string },
  permissionKeys: readonly string[],
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<Role> {
  const role = await db.transaction(async (tx) => {
    const database = tx as unknown as Database;
    const created = await insertRole(database, input, actor);
    if (permissionKeys.length > 0) await setRolePermissionsInTx(database, created.id, permissionKeys, actor);
    return created;
  });
  // Permission edits affect an unknown set of users, so the whole cache goes — after commit.
  invalidateAll();
  return role;
}

export async function updateRole(
  db: Database,
  id: string,
  input: { name?: string; description?: string },
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<Role> {
  return db.transaction(async (tx) => {
    const beforeRows = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
    const before = beforeRows[0];
    if (!before) throw ApiError.notFound("Role not found");

    const patch: Partial<Pick<Role, "name" | "description" | "updatedAt">> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;

    const rows = await tx.update(roles).set(patch).where(eq(roles.id, id)).returning();
    const after = rows[0] as Role;

    // slop-ok: bentuknya sama dengan call site lain karena helper memusatkan field tetap;
    // yang berbeda hanya nama event, dan itu memang data, bukan duplikasi logika.
    await auditChange(tx as unknown as Database, {
      actor,
      event: "role.updated",
      subject: { type: "role", id: id },
      before: snapshot("role", before as unknown as Record<string, unknown>),
      after: snapshot("role", after as unknown as Record<string, unknown>),
    });
    return after;
  });
}

/** A system role is removed from code, not from the DB — so a way in always exists. */
export async function deleteRole(
  db: Database,
  id: string,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const role = await requireRoleInTx(tx, id);
    if (role.isSystem) throw ApiError.conflict("Role sistem tidak bisa dihapus");

    // The FK would cascade `user_roles`; that silently revokes people's access. Refuse first.
    const inUse = await tx.select({ id: userRoles.id }).from(userRoles).where(eq(userRoles.roleId, id)).limit(1);
    if (inUse.length > 0) throw ApiError.conflict("Role masih dipakai pengguna");

    await tx.delete(roles).where(eq(roles.id, id));

    await auditChange(tx as unknown as Database, {
      actor,
      event: "role.deleted",
      subject: { type: "role", id: id },
      before: snapshot("role", role as unknown as Record<string, unknown>),
    });
    return { id };
  });
}

/**
 * The transactional body of `setRolePermissions`; also used by `createRoleWithPermissions`
 * so a new role's first permission set lands in the same transaction as the role row.
 */
async function setRolePermissionsInTx(
  db: Database,
  id: string,
  keys: readonly string[],
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ permissions: string[] }> {
  const role = await requireRoleInTx(db, id);
  // Emptying a system role removes the safety net the next boot would have to restore.
  if (role.isSystem && keys.length === 0) {
    throw ApiError.conflict("A system role's permission set cannot be emptied");
  }

  const known = await db.select({ id: permissions.id, key: permissions.key }).from(permissions);
  const idByKey = new Map(known.map((r) => [r.key, r.id]));
  const unknown = keys.filter((k) => !idByKey.has(k));
  if (unknown.length > 0)
    throw ApiError.validation(
      unknown.map((k) => ({ code: "custom", path: ["permissions", k], message: `permission tidak dikenal: ${k}` })),
    );

  const before = await permissionsForRole(db, id);
  const wanted = [...new Set(keys)].map((k) => ({ roleId: id, permissionId: idByKey.get(k) as string }));

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
  if (wanted.length > 0) await db.insert(rolePermissions).values(wanted);

  await auditChange(db, {
    actor,
    event: "role.permissions_set",
    subject: { type: "role", id: id },
    before: { entity: "role", id, permissions: before },
    after: { entity: "role", id, permissions: [...keys].sort() },
  });
  return { permissions: [...keys].sort() };
}

/**
 * Overwrites all of a role's permissions with the submitted list (not add/remove one by one):
 * the permission screen is a full checkbox grid, so the last request is the truth.
 * The cache is dropped only after the transaction commits.
 */
export async function setRolePermissions(
  db: Database,
  id: string,
  keys: readonly string[],
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ permissions: string[] }> {
  const result = await db.transaction((tx) => setRolePermissionsInTx(tx as unknown as Database, id, keys, actor));
  // Permission edits affect an unknown set of users, so the whole cache goes.
  invalidateAll();
  return result;
}

export async function findRoleByKey(db: Database, key: string): Promise<Role | undefined> {
  const rows = await db.select().from(roles).where(eq(roles.key, key)).limit(1);
  return rows[0];
}

/**
 * Grants a role to a user. Idempotent: assigning the same role twice is not an error,
 * because the unique index treats the pair as one assignment.
 *
 * The permission cache is invalidated by the caller AFTER its transaction commits
 * (`assignUserRole`, `replaceUserRoles`, `user:grant`): invalidating here would drop cached
 * access for a write that can still roll back, and re-cache stale data in the window before commit.
 */
export async function assignRole(db: Database, input: { userId: string; roleId: string }): Promise<void> {
  const existing = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.userId, input.userId), eq(userRoles.roleId, input.roleId)))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(userRoles).values({ userId: input.userId, roleId: input.roleId });
}

/** Revokes a role from a user; the caller invalidates the cache after commit, as above. */
export async function revokeRole(db: Database, userId: string, roleId: string): Promise<boolean> {
  const rows = await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
    .returning({ id: userRoles.id });
  return rows.length > 0;
}
