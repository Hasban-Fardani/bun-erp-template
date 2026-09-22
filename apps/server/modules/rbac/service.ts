import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "../../http/errors.ts";
import { toOffset } from "../../http/list-query.ts";
import { orderByColumn } from "../../http/sort.ts";
import type { Database } from "../../platform/database/index.ts";
import { auditChange, snapshot } from "../audit/service.ts";
import { invalidateAll, invalidateUser, readCachedPermissions, writeCachedPermissions } from "./cache.ts";
import { permissions, rolePermissions, roles, userRoles } from "./data.ts";
import type { ListRolesInput } from "./schema.ts";
import { allPermissions, type PermissionKey, type SystemRoleKey, systemRoles } from "./statements.ts";

export type Role = typeof roles.$inferSelect;

/**
 * Loads one role inside a transaction, scoped to the organization. Shared by delete and
 * permission-set so the lookup cannot drift between the two write paths.
 */
async function requireRoleInTx(tx: Pick<Database, "select">, organizationId: string, id: string): Promise<Role> {
  const rows = await tx
    .select()
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.id, id)))
    .limit(1);
  const role = rows[0];
  if (!role) throw ApiError.notFound("Role not found");
  return role;
}

/** Syncs the permission catalogue + system roles from code; idempotent. */
export async function seedRbac(db: Database, organizationId: string): Promise<{ permissions: number; roles: number }> {
  await db
    .insert(permissions)
    .values(allPermissions.map((key) => ({ key })))
    .onConflictDoNothing({ target: permissions.key });

  await db
    .delete(permissions)
    .where(sql`${permissions.key} not in ${sql.raw(`(${allPermissions.map((k) => `'${k}'`).join(", ")})`)}`);

  const permissionRows = await db.select({ id: permissions.id, key: permissions.key }).from(permissions);
  const idByKey = new Map(permissionRows.map((r) => [r.key, r.id]));

  let roleCount = 0;
  for (const [key, definition] of Object.entries(systemRoles) as [
    SystemRoleKey,
    (typeof systemRoles)[SystemRoleKey],
  ][]) {
    const rows = await db
      .insert(roles)
      .values({
        organizationId,
        key,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: [roles.organizationId, roles.key],
        set: { name: definition.name, description: definition.description, isSystem: true, updatedAt: new Date() },
      })
      .returning({ id: roles.id });

    const roleId = rows[0]?.id;
    if (!roleId) continue;
    roleCount += 1;

    const wanted = definition.permissions
      .map((p) => idByKey.get(p))
      .filter((id): id is string => typeof id === "string");

    // Full sync: a system role must match its definition in code exactly.
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (wanted.length > 0) {
      await db.insert(rolePermissions).values(wanted.map((permissionId) => ({ roleId, permissionId })));
    }
  }

  return { permissions: permissionRows.length, roles: roleCount };
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

/** Roles a user holds along with their scopes — the UI uses this to show context. */
export async function rolesForUser(db: Database, userId: string) {
  return db
    .select({
      roleId: roles.id,
      key: roles.key,
      name: roles.name,
      scopeType: userRoles.scopeType,
      scopeId: userRoles.scopeId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
}

/**
 * Roles stay small in practice, but the contract is the same as every other collection so a
 * client never has to special-case this endpoint. Permissions are attached by the route.
 */
export async function listRoles(
  db: Database,
  organizationId: string,
  input: ListRolesInput,
): Promise<{ items: Role[]; total: number }> {
  const where = eq(roles.organizationId, organizationId);
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

/** Permission catalogue a role holds, used by the UI to render checkboxes. */
export async function permissionsForRole(db: Database, roleId: string): Promise<string[]> {
  const rows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  return rows.map((r) => r.key).sort();
}

/**
 * Creates a custom role. System roles come from code and are not created here —
 * one that diverges from the `statements` definition loses at the next seed.
 */
export async function createRole(
  db: Database,
  organizationId: string,
  input: { key: string; name: string; description?: string },
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<Role> {
  return db.transaction(async (tx) => {
    const clash = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.key, input.key)))
      .limit(1);
    if (clash.length > 0) throw ApiError.conflict("Role key already exists");

    const rows = await tx
      .insert(roles)
      .values({ organizationId, key: input.key, name: input.name, description: input.description ?? "" })
      .returning();
    const role = rows[0] as Role;

    await auditChange(tx as unknown as Database, {
      organizationId,
      actor,
      event: "role.created",
      subject: { type: "role", id: role.id },
      after: snapshot("role", role as unknown as Record<string, unknown>),
    });
    return role;
  });
}

export async function updateRole(
  db: Database,
  organizationId: string,
  id: string,
  input: { name?: string; description?: string },
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<Role> {
  return db.transaction(async (tx) => {
    const beforeRows = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.id, id)))
      .limit(1);
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
      organizationId,
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
  organizationId: string,
  id: string,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const role = await requireRoleInTx(tx, organizationId, id);
    if (role.isSystem) throw ApiError.conflict("Role sistem tidak bisa dihapus");

    // The FK would cascade `user_roles`; that silently revokes people's access. Refuse first.
    const inUse = await tx.select({ id: userRoles.id }).from(userRoles).where(eq(userRoles.roleId, id)).limit(1);
    if (inUse.length > 0) throw ApiError.conflict("Role masih dipakai pengguna");

    await tx.delete(roles).where(eq(roles.id, id));

    await auditChange(tx as unknown as Database, {
      organizationId,
      actor,
      event: "role.deleted",
      subject: { type: "role", id: id },
      before: snapshot("role", role as unknown as Record<string, unknown>),
    });
    return { id };
  });
}

/**
 * Overwrites all of a role's permissions with the submitted list (not add/remove one by one):
 * the permission screen is a full checkbox grid, so the last request is the truth.
 */
export async function setRolePermissions(
  db: Database,
  organizationId: string,
  id: string,
  keys: readonly string[],
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ permissions: string[] }> {
  return db.transaction(async (tx) => {
    await requireRoleInTx(tx, organizationId, id);

    const known = await tx.select({ id: permissions.id, key: permissions.key }).from(permissions);
    const idByKey = new Map(known.map((r) => [r.key, r.id]));
    const unknown = keys.filter((k) => !idByKey.has(k));
    if (unknown.length > 0)
      throw ApiError.validation(
        unknown.map((k) => ({ code: "custom", path: ["permissions", k], message: `permission tidak dikenal: ${k}` })),
      );

    const before = await permissionsForRole(tx as unknown as Database, id);
    const wanted = [...new Set(keys)].map((k) => ({ roleId: id, permissionId: idByKey.get(k) as string }));

    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    if (wanted.length > 0) await tx.insert(rolePermissions).values(wanted);

    await auditChange(tx as unknown as Database, {
      organizationId,
      actor,
      event: "role.permissions_set",
      subject: { type: "role", id: id },
      before: { entity: "role", id, permissions: before },
      after: { entity: "role", id, permissions: [...keys].sort() },
    });
    // Permission edits affect an unknown set of users, so the whole cache goes.
    invalidateAll();
    return { permissions: [...keys].sort() };
  });
}

export async function findRoleByKey(db: Database, organizationId: string, key: string): Promise<Role | undefined> {
  const rows = await db
    .select()
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.key, key)))
    .limit(1);
  return rows[0];
}

/**
 * Grants a role to a user. Idempotent: assigning the same role twice is not an error,
 * because its unique index treats `scope_id` NULL as a single value.
 */
export async function assignRole(
  db: Database,
  input: { userId: string; roleId: string; scopeType?: string; scopeId?: string },
): Promise<void> {
  const scopeType = input.scopeType ?? null;
  const scopeId = input.scopeId ?? null;
  if ((scopeType === null) !== (scopeId === null)) {
    throw new ApiError("VALIDATION_FAILED", 422, "scopeType and scopeId must be provided together");
  }

  const existing = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, input.userId),
        eq(userRoles.roleId, input.roleId),
        scopeType === null ? isNull(userRoles.scopeType) : eq(userRoles.scopeType, scopeType),
        scopeId === null ? isNull(userRoles.scopeId) : eq(userRoles.scopeId, scopeId),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(userRoles).values({ userId: input.userId, roleId: input.roleId, scopeType, scopeId });
  invalidateUser(input.userId);
}

export async function revokeRole(db: Database, userId: string, roleId: string): Promise<boolean> {
  const rows = await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
    .returning({ id: userRoles.id });
  if (rows.length > 0) invalidateUser(userId);
  return rows.length > 0;
}
