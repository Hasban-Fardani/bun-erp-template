import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "../../http/errors.ts";
import type { Database } from "../../platform/database/index.ts";
import { recordAudit, snapshot } from "../audit/service.ts";
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

/** Katalog izin yang dipegang role, dipakai UI untuk mencentang. */
export async function permissionsForRole(db: Database, roleId: string): Promise<string[]> {
  const rows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  return rows.map((r) => r.key).sort();
}

/**
 * Membuat role kustom. Role sistem berasal dari kode dan tidak dibuat lewat sini —
 * menyimpang dari definisi `statements` akan kalah saat seed berikutnya.
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

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "role.created",
      subjectType: "role",
      subjectId: role.id,
      after: snapshot("role", role as unknown as Record<string, unknown>),
      traceId: actor.traceId,
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

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "role.updated",
      subjectType: "role",
      subjectId: id,
      before: snapshot("role", before as unknown as Record<string, unknown>),
      after: snapshot("role", after as unknown as Record<string, unknown>),
      traceId: actor.traceId,
    });
    return after;
  });
}

/** Role sistem dihapus dari kode, bukan dari DB — biar jalur masuk selalu ada. */
export async function deleteRole(
  db: Database,
  organizationId: string,
  id: string,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.id, id)))
      .limit(1);
    const role = rows[0];
    if (!role) throw ApiError.notFound("Role not found");
    if (role.isSystem) throw ApiError.conflict("Role sistem tidak bisa dihapus");

    // FK akan meng-cascade `user_roles`; itu mencabut akses orang diam-diam. Tolak lebih dulu.
    const inUse = await tx.select({ id: userRoles.id }).from(userRoles).where(eq(userRoles.roleId, id)).limit(1);
    if (inUse.length > 0) throw ApiError.conflict("Role masih dipakai pengguna");

    await tx.delete(roles).where(eq(roles.id, id));

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "role.deleted",
      subjectType: "role",
      subjectId: id,
      before: snapshot("role", role as unknown as Record<string, unknown>),
      traceId: actor.traceId,
    });
    return { id };
  });
}

/**
 * Menimpa seluruh izin role dengan daftar yang dikirim (bukan tambah/cabut satu-satu):
 * layar izin adalah kotak centang penuh, jadi permintaan terakhir adalah kebenarannya.
 */
export async function setRolePermissions(
  db: Database,
  organizationId: string,
  id: string,
  keys: readonly string[],
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ permissions: string[] }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.id, id)))
      .limit(1);
    const role = rows[0];
    if (!role) throw ApiError.notFound("Role not found");

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

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "role.permissions_set",
      subjectType: "role",
      subjectId: id,
      before: { entity: "role", id, permissions: before },
      after: { entity: "role", id, permissions: [...keys].sort() },
      traceId: actor.traceId,
    });
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

/** Beri permission ke role non-sistem. Idempotent. */
export async function grantRolePermissions(
  db: Database,
  roleId: string,
  keys: readonly PermissionKey[],
): Promise<void> {
  const rows = await db.select({ id: permissions.id, key: permissions.key }).from(permissions);
  const idByKey = new Map(rows.map((r) => [r.key, r.id]));
  for (const key of keys) {
    const permissionId = idByKey.get(key);
    if (!permissionId) throw ApiError.notFound(`Permission not found: ${key}`);
    const existing = await db
      .select({ roleId: rolePermissions.roleId })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(rolePermissions).values({ roleId, permissionId });
  }
}

/** Cabut permission dari role. */
export async function revokeRolePermission(db: Database, roleId: string, key: PermissionKey): Promise<void> {
  const rows = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.key, key)).limit(1);
  const permissionId = rows[0]?.id;
  if (!permissionId) return;
  await db
    .delete(rolePermissions)
    .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)));
}
