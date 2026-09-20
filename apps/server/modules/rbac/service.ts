import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "../../http/errors.ts";
import type { Database } from "../../platform/database/index.ts";
import { permissions, rolePermissions, roles, userRoles } from "./data.ts";
import { allPermissions, type PermissionKey, type SystemRoleKey, systemRoles } from "./statements.ts";

export type Role = typeof roles.$inferSelect;

/** Sinkron katalog permission + role sistem dari kode; idempotent. */
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

    // Sinkron penuh: role sistem harus persis sama dengan definisinya di kode.
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (wanted.length > 0) {
      await db.insert(rolePermissions).values(wanted.map((permissionId) => ({ roleId, permissionId })));
    }
  }

  return { permissions: permissionRows.length, roles: roleCount };
}

/** Gabungan izin semua role user. Penyaringan per-record adalah tugas policy modul. */
export async function permissionsForUser(db: Database, userId: string): Promise<PermissionKey[]> {
  const rows = await db
    .selectDistinct({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  return rows.map((r) => r.key) as PermissionKey[];
}

/** Role yang dipegang user beserta lingkunpnya — dipakai UI untuk menampilkan konteks. */
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

export async function listRoles(db: Database, organizationId: string): Promise<Role[]> {
  return db.select().from(roles).where(eq(roles.organizationId, organizationId)).orderBy(roles.key);
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
 * Memberi role ke user. Idempotent: menugaskan role yang sama dua kali tidak error,
 * karena unique index-nya memperlakukan `scope_id` NULL sebagai satu nilai.
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
}

export async function revokeRole(db: Database, userId: string, roleId: string): Promise<boolean> {
  const rows = await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
    .returning({ id: userRoles.id });
  return rows.length > 0;
}
