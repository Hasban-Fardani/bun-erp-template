import { hashPassword } from "better-auth/crypto";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";

/** Re-export: the CLI (erp.ts) uses the same hash primitives, not a duplicate. */
export { hashPassword };

import { ApiError } from "../../http/errors.ts";
import type { Database } from "../../platform/database/index.ts";
import { recordAudit, snapshot } from "../audit/service.ts";
import { permissions as rbacPermissions, roles as rbacRoles, rolePermissions, userRoles } from "../rbac/data.ts";
import { assignRole, findRoleByKey, revokeRole } from "../rbac/service.ts";
import { accounts, users } from "./data.ts";
import type { CreateUserInput, ListUsersInput, UpdateUserInput } from "./schema.ts";

export type User = typeof users.$inferSelect;

/** Safe shape to send to clients: no account/credential columns here. */
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  organizationId: string | null;
  createdAt: Date;
  roles: { roleId: string; key: string; name: string; scopeType: string | null; scopeId: string | null }[];
  permissions: string[];
};

/**
 * Roles + permissions for MANY users in two queries. A per-user (N+1) version makes a
 * 50-row list fire ~100 queries; this batch keeps it at 4 queries however long the list.
 */
async function rolesAndPermissionsFor(
  db: Database,
  userIds: string[],
): Promise<{
  roles: Map<string, PublicUser["roles"]>;
  permissions: Map<string, string[]>;
}> {
  const roles = new Map<string, PublicUser["roles"]>();
  const permissions = new Map<string, string[]>();
  if (userIds.length === 0) return { roles, permissions };

  const [roleRows, permissionRows] = await Promise.all([
    db
      .select({
        userId: userRoles.userId,
        roleId: rbacRoles.id,
        key: rbacRoles.key,
        name: rbacRoles.name,
        scopeType: userRoles.scopeType,
        scopeId: userRoles.scopeId,
      })
      .from(userRoles)
      .innerJoin(rbacRoles, eq(rbacRoles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, userIds)),
    db
      .selectDistinct({ userId: userRoles.userId, key: rbacPermissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(rbacPermissions, eq(rbacPermissions.id, rolePermissions.permissionId))
      .where(inArray(userRoles.userId, userIds)),
  ]);

  for (const row of roleRows) {
    const list = roles.get(row.userId) ?? [];
    list.push({ roleId: row.roleId, key: row.key, name: row.name, scopeType: row.scopeType, scopeId: row.scopeId });
    roles.set(row.userId, list);
  }
  for (const row of permissionRows) {
    const list = permissions.get(row.userId) ?? [];
    list.push(row.key);
    permissions.set(row.userId, list);
  }
  return { roles, permissions };
}

async function toPublicUser(db: Database, user: User): Promise<PublicUser> {
  const { roles, permissions } = await rolesAndPermissionsFor(db, [user.id]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    organizationId: user.organizationId,
    createdAt: user.createdAt,
    roles: roles.get(user.id) ?? [],
    permissions: permissions.get(user.id) ?? [],
  };
}

export async function listUsers(
  db: Database,
  organizationId: string,
  input: ListUsersInput,
): Promise<{ items: PublicUser[]; total: number }> {
  const where = and(
    eq(users.organizationId, organizationId),
    input.search ? or(ilike(users.name, `%${input.search}%`), ilike(users.email, `%${input.search}%`)) : undefined,
  );

  const [rows, count] = await Promise.all([
    db.select().from(users).where(where).orderBy(users.name).limit(input.limit).offset(input.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(where),
  ]);

  const { roles, permissions } = await rolesAndPermissionsFor(
    db,
    rows.map((r) => r.id),
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      emailVerified: r.emailVerified,
      organizationId: r.organizationId,
      createdAt: r.createdAt,
      roles: roles.get(r.id) ?? [],
      permissions: permissions.get(r.id) ?? [],
    })),
    total: count[0]?.total ?? 0,
  };
}

export async function findUser(db: Database, organizationId: string, id: string): Promise<PublicUser | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.id, id)))
    .limit(1);
  const user = rows[0];
  return user ? toPublicUser(db, user) : undefined;
}

/**
 * Updates a profile. Changes go to the audit with before/after snapshots;
 * snapshots pass through `redactEntity` so password hashes and tokens never land there.
 */
export async function updateUser(
  db: Database,
  organizationId: string,
  id: string,
  input: UpdateUserInput,
  actor: { userId: string; traceId: string; label?: string },
): Promise<PublicUser> {
  return db.transaction(async (tx) => {
    const beforeRows = await tx
      .select()
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.id, id)))
      .limit(1);
    const before = beforeRows[0];
    if (!before) throw ApiError.notFound("User not found");

    const patch: Partial<Pick<User, "name" | "organizationId" | "emailVerified" | "updatedAt">> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.organizationId !== undefined) patch.organizationId = input.organizationId;
    if (input.emailVerified !== undefined) patch.emailVerified = input.emailVerified;

    const rows = await tx.update(users).set(patch).where(eq(users.id, id)).returning();
    const after = rows[0] as User;

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "user.updated",
      subjectType: "user",
      subjectId: id,
      before: snapshot("user", before as unknown as Record<string, unknown>),
      after: snapshot("user", after as unknown as Record<string, unknown>),
      traceId: actor.traceId,
    });

    return toPublicUser(tx as unknown as Database, after);
  });
}

/**
 * Creates a user + email/password credentials in one go (admin invite without a mail server).
 * The hash uses Better Auth's own primitives so the next sign-in is valid immediately.
 */
export async function createUser(
  db: Database,
  organizationId: string,
  input: CreateUserInput,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<PublicUser> {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing.length > 0) throw ApiError.conflict("Email already exists");

    const rows = await tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        organizationId,
        emailVerified: true,
      })
      .returning();
    const user = rows[0] as User;

    await tx.insert(accounts).values({
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: await hashPassword(input.password),
    });

    if (input.roleKey) {
      const role = await findRoleByKey(tx as unknown as Database, organizationId, input.roleKey);
      if (!role) throw ApiError.notFound(`Role not found: ${input.roleKey}`);
      await assignRole(tx as unknown as Database, { userId: user.id, roleId: role.id });
    }

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "user.created",
      subjectType: "user",
      subjectId: user.id,
      after: snapshot("user", user as unknown as Record<string, unknown>),
      traceId: actor.traceId,
    });

    return toPublicUser(tx as unknown as Database, user);
  });
}

/**
 * Deletes a user from the organization. Sessions/credentials follow via ON DELETE CASCADE;
 * the audit trail is deliberately left alive — actorId has no FK (deleting a user must not destroy evidence).
 */
export async function deleteUser(
  db: Database,
  organizationId: string,
  id: string,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const before = await findUserInOrg(tx as unknown as Database, organizationId, id);
    if (before.id === actor.userId) throw ApiError.conflict("Cannot delete yourself");

    await tx.delete(users).where(eq(users.id, id));

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "user.deleted",
      subjectType: "user",
      subjectId: id,
      before: snapshot("user", before as unknown as Record<string, unknown>),
      traceId: actor.traceId,
    });
    return { id };
  });
}

/** The user must exist IN THIS ORGANIZATION — a client-supplied id must not cross organizations. */
async function findUserInOrg(db: Database, organizationId: string, userId: string) {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, organizationId), eq(users.id, userId)))
    .limit(1);
  if (!rows[0]) throw ApiError.notFound("User not found");
  return rows[0];
}

/**
 * Assigns a role. The role is looked up by `key` within the actor's organization, never by a raw
 * client-supplied id — that prevents assigning another organization's role.
 */
export async function assignUserRole(
  db: Database,
  organizationId: string,
  userId: string,
  input: { roleKey: string; scopeType?: string; scopeId?: string },
  actor: { userId: string; traceId: string; label?: string },
): Promise<PublicUser> {
  return db.transaction(async (tx) => {
    const user = await findUserInOrg(tx as unknown as Database, organizationId, userId);

    const role = await findRoleByKey(tx as unknown as Database, organizationId, input.roleKey);
    if (!role) throw ApiError.notFound(`Role not found: ${input.roleKey}`);

    await assignRole(tx as unknown as Database, {
      userId,
      roleId: role.id,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    });

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "user.role_assigned",
      subjectType: "user",
      subjectId: userId,
      after: snapshot("userRole", {
        userId,
        roleId: role.id,
        scopeType: input.scopeType ?? null,
        scopeId: input.scopeId ?? null,
      }),
      traceId: actor.traceId,
    });

    return toPublicUser(tx as unknown as Database, user);
  });
}

export async function revokeUserRole(
  db: Database,
  organizationId: string,
  userId: string,
  roleKey: string,
  actor: { userId: string; traceId: string; label?: string },
): Promise<PublicUser> {
  return db.transaction(async (tx) => {
    const user = await findUserInOrg(tx as unknown as Database, organizationId, userId);

    const role = await findRoleByKey(tx as unknown as Database, organizationId, roleKey);
    if (!role) throw ApiError.notFound(`Role not found: ${roleKey}`);

    const removed = await revokeRole(tx as unknown as Database, userId, role.id);
    if (!removed) throw ApiError.notFound("User does not hold this role");

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "user.role_revoked",
      subjectType: "user",
      subjectId: userId,
      before: snapshot("userRole", { userId, roleId: role.id, scopeType: null, scopeId: null }),
      traceId: actor.traceId,
    });

    return toPublicUser(tx as unknown as Database, user);
  });
}
