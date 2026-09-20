import { and, eq, ilike, or, sql } from "drizzle-orm";
import { ApiError } from "../../http/errors.ts";
import type { Database } from "../../platform/database/index.ts";
import { recordAudit, snapshot } from "../audit/service.ts";
import { assignRole, findRoleByKey, permissionsForUser, revokeRole, rolesForUser } from "../rbac/service.ts";
import { users } from "./data.ts";
import type { ListUsersInput, UpdateUserInput } from "./schema.ts";

export type User = typeof users.$inferSelect;

/** Bentuk aman untuk dikirim ke klien: tidak ada kolom akun/kredensial di sini. */
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

async function toPublicUser(db: Database, user: User): Promise<PublicUser> {
  const [roles, permissions] = await Promise.all([rolesForUser(db, user.id), permissionsForUser(db, user.id)]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    organizationId: user.organizationId,
    createdAt: user.createdAt,
    roles,
    permissions: [...permissions],
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

  return { items: await Promise.all(rows.map((r) => toPublicUser(db, r))), total: count[0]?.total ?? 0 };
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
 * Memperbarui profil. Perubahan dicatat ke audit dengan snapshot sebelum/sesudah;
 * snapshot disaring `redactEntity` sehingga hash sandi dan token tidak pernah masuk.
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

/** User harus ada DI ORGANISASI INI — id dari klien tidak boleh melintasi organisasi. */
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
 * Menugaskan role. Role dicari lewat `key` di organisasi aktor, bukan lewat id mentah
 * dari klien — mencegah menugaskan role milik organisasi lain.
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
