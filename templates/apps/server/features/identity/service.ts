import { hashPassword } from "better-auth/crypto";
import { eq, ilike, inArray, or, sql } from "drizzle-orm";

/** Re-export: the CLI (cli/) uses the same hash primitives, not a duplicate. */
export { hashPassword };

import type { Database } from "../../database/index.ts";
import { ApiError } from "../../http/helpers/errors.ts";
import { toOffset } from "../../http/helpers/list-query.ts";
import { orderByColumn } from "../../http/helpers/sort.ts";
import { auditChange, snapshot } from "../audit/service.ts";
import { invalidateUser } from "../rbac/cache.ts";
import { permissions as rbacPermissions, roles as rbacRoles, rolePermissions, userRoles } from "../rbac/schema.ts";
import { assignRole, findRoleByKey, revokeRole } from "../rbac/service.ts";
import { accounts, users } from "./schema.ts";
import type { CreateUserInput, ListUsersInput, UpdateUserInput } from "./validation.ts";

export type User = typeof users.$inferSelect;

/** Safe shape to send to clients: no account/credential columns here. */
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  roles: { roleId: string; key: string; name: string }[];
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
    list.push({ roleId: row.roleId, key: row.key, name: row.name });
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
    createdAt: user.createdAt,
    roles: roles.get(user.id) ?? [],
    permissions: permissions.get(user.id) ?? [],
  };
}

export async function listUsers(db: Database, input: ListUsersInput): Promise<{ items: PublicUser[]; total: number }> {
  const where = input.search
    ? or(ilike(users.name, `%${input.search}%`), ilike(users.email, `%${input.search}%`))
    : undefined;

  const [rows, count] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(...orderByColumn(users, input.sort, input.dir))
      .limit(input.perPage)
      .offset(toOffset(input).offset),
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
      createdAt: r.createdAt,
      roles: roles.get(r.id) ?? [],
      permissions: permissions.get(r.id) ?? [],
    })),
    total: count[0]?.total ?? 0,
  };
}

export async function findUser(db: Database, id: string): Promise<PublicUser | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const user = rows[0];
  return user ? toPublicUser(db, user) : undefined;
}

/**
 * Updates a profile. Changes go to the audit with before/after snapshots;
 * snapshots pass through `redactEntity` so password hashes and tokens never land there.
 */
export async function updateUser(
  db: Database,
  id: string,
  input: UpdateUserInput,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<PublicUser> {
  return db.transaction(async (tx) => {
    const beforeRows = await tx.select().from(users).where(eq(users.id, id)).limit(1);
    const before = beforeRows[0];
    if (!before) throw ApiError.notFound("User not found");

    const patch: Partial<Pick<User, "name" | "emailVerified" | "updatedAt">> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.emailVerified !== undefined) patch.emailVerified = input.emailVerified;

    const rows = await tx.update(users).set(patch).where(eq(users.id, id)).returning();
    const after = rows[0] as User;

    await auditChange(tx as unknown as Database, {
      actor,
      event: "user.updated",
      subject: { type: "user", id: id },
      before: snapshot("user", before as unknown as Record<string, unknown>),
      after: snapshot("user", after as unknown as Record<string, unknown>),
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
      const role = await findRoleByKey(tx as unknown as Database, input.roleKey);
      if (!role) throw ApiError.notFound(`Role not found: ${input.roleKey}`);
      await assignRole(tx as unknown as Database, { userId: user.id, roleId: role.id });
    }

    await auditChange(tx as unknown as Database, {
      actor,
      event: "user.created",
      subject: { type: "user", id: user.id },
      after: snapshot("user", user as unknown as Record<string, unknown>),
    });

    return toPublicUser(tx as unknown as Database, user);
  });
}

/**
 * Deletes a user. Sessions/credentials follow via ON DELETE CASCADE;
 * the audit trail is deliberately left alive — actorId has no FK (deleting a user must not destroy evidence).
 */
export async function deleteUser(
  db: Database,
  id: string,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const before = await findUserOrThrow(tx as unknown as Database, id);
    if (before.id === actor.userId) throw ApiError.conflict("Cannot delete yourself");

    await tx.delete(users).where(eq(users.id, id));

    await auditChange(tx as unknown as Database, {
      actor,
      event: "user.deleted",
      subject: { type: "user", id: id },
      before: snapshot("user", before as unknown as Record<string, unknown>),
    });
    return { id };
  });
}

/** A client-supplied id must point at an existing row; absent = 404, never a silent write. */
async function findUserOrThrow(db: Database, userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!rows[0]) throw ApiError.notFound("User not found");
  return rows[0];
}

/** Assigns a role by `key`, never by a raw client-supplied id. */
export async function assignUserRole(
  db: Database,
  userId: string,
  input: { roleKey: string },
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<PublicUser> {
  return db.transaction(async (tx) => {
    const user = await findUserOrThrow(tx as unknown as Database, userId);

    const role = await findRoleByKey(tx as unknown as Database, input.roleKey);
    if (!role) throw ApiError.notFound(`Role not found: ${input.roleKey}`);

    await assignRole(tx as unknown as Database, { userId, roleId: role.id });

    await auditChange(tx as unknown as Database, {
      actor,
      event: "user.role_assigned",
      subject: { type: "user", id: userId },
      after: snapshot("userRole", { userId, roleId: role.id }),
    });

    return toPublicUser(tx as unknown as Database, user);
  });
}

export async function revokeUserRole(
  db: Database,
  userId: string,
  roleKey: string,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<PublicUser> {
  return db.transaction(async (tx) => {
    const user = await findUserOrThrow(tx as unknown as Database, userId);

    const role = await findRoleByKey(tx as unknown as Database, roleKey);
    if (!role) throw ApiError.notFound(`Role not found: ${roleKey}`);

    const removed = await revokeRole(tx as unknown as Database, userId, role.id);
    if (!removed) throw ApiError.notFound("User does not hold this role");

    await auditChange(tx as unknown as Database, {
      actor,
      event: "user.role_revoked",
      subject: { type: "user", id: userId },
      before: snapshot("userRole", { userId, roleId: role.id }),
    });

    return toPublicUser(tx as unknown as Database, user);
  });
}

/** Replaces a user's roles atomically. */
export async function replaceUserRoles(
  db: Database,
  userId: string,
  keys: readonly string[],
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<PublicUser> {
  const result = await db.transaction(async (tx) => {
    const database = tx as unknown as Database;
    const user = await findUserOrThrow(database, userId);
    const wanted = [];
    for (const key of new Set(keys)) {
      const role = await findRoleByKey(database, key);
      if (!role) throw ApiError.notFound(`Role not found: ${key}`);
      wanted.push(role);
    }
    const before = await toPublicUser(database, user);
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    for (const role of wanted) await assignRole(database, { userId, roleId: role.id });
    const after = await toPublicUser(database, user);
    await auditChange(database, {
      actor,
      event: "user.roles_replaced",
      subject: { type: "user", id: userId },
      before: { roles: before.roles },
      after: { roles: after.roles },
    });
    return after;
  });
  invalidateUser(userId);
  return result;
}
