import { and, eq } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { ApiError } from "../../http/helpers/errors.ts";
import { auditChange } from "../audit/index.ts";
import { permissionsForUser, userHoldsRoleKey } from "../rbac/index.ts";
import { sessions, users } from "./schema.ts";

/**
 * Impersonation lives on the existing DB sessions: a `session` row for the target whose
 * `impersonated_by` names the admin. It has its own cookie, so the admin's Better Auth session is
 * never touched and "stop" is just deleting this row. No in-memory state: any replica or Worker
 * isolate answers the same way. Better Auth's admin plugin was not used (see the F3.4 evidence):
 * it requires a `role` column and its own role model, which would replace this repo's RBAC.
 */
export const IMPERSONATION_COOKIE = "loom_impersonation";

/** Self-service credential changes Better Auth would otherwise apply to the admin's own account. */
export const BLOCKED_AUTH_PATHS = [
  "/change-password",
  "/set-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/two-factor/",
] as const;

export function isBlockedAuthPath(authPath: string): boolean {
  return BLOCKED_AUTH_PATHS.some((p) => (p.endsWith("/") ? authPath.startsWith(p) : authPath === p));
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

type Resolved =
  | { state: "active"; target: typeof users.$inferSelect; expiresAt: Date }
  | { state: "expired" | "invalid" };

/**
 * Looks up an impersonation token for the admin whose own session is valid. A token bound to any
 * other admin is `invalid`, so it cannot be replayed from another account.
 */
export async function resolveImpersonation(db: Database, token: string, adminId: string): Promise<Resolved> {
  const rows = await db
    .select({ session: sessions, target: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, token))
    .limit(1);
  const row = rows[0];
  if (!row || row.session.impersonatedBy !== adminId) return { state: "invalid" };
  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return { state: "expired" };
  }
  return { state: "active", target: row.target, expiresAt: row.session.expiresAt };
}

export type ImpersonationActor = {
  userId: string;
  traceId: string;
  label: string;
  impersonator?: { userId: string } | null;
};

/** Policy lives here, not in the route, so the CLI or a test can reuse it. */
export async function startImpersonation(
  db: Database,
  input: { ttlMinutes: number },
  actor: ImpersonationActor,
  targetId: string,
): Promise<{ token: string; expiresAt: Date; target: { id: string; name: string; email: string } }> {
  if (actor.impersonator) throw ApiError.forbidden("Stop the current impersonation before starting another");
  if (targetId === actor.userId) throw ApiError.forbidden("You cannot impersonate yourself");

  const target = (await db.select().from(users).where(eq(users.id, targetId)).limit(1))[0];
  if (!target) throw ApiError.notFound("User not found");
  if (await userHoldsRoleKey(db, targetId, "owner")) throw ApiError.forbidden("An owner cannot be impersonated");
  if ((await permissionsForUser(db, targetId)).includes("user.impersonate")) {
    throw ApiError.forbidden("A user who can impersonate cannot be impersonated");
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000);
  await db.transaction(async (tx) => {
    // One live impersonation per admin: leftovers of an expired or abandoned one are dropped.
    await tx.delete(sessions).where(eq(sessions.impersonatedBy, actor.userId));
    await tx.insert(sessions).values({ token, userId: targetId, impersonatedBy: actor.userId, expiresAt });
    await auditChange(tx, {
      actor,
      event: "impersonation.started",
      subject: { type: "user", id: targetId },
      after: { targetEmail: target.email, expiresAt: expiresAt.toISOString() },
    });
  });
  return { token, expiresAt, target: { id: target.id, name: target.name, email: target.email } };
}

/** Ends the impersonation behind `token`; the admin's own session was never replaced. */
export async function stopImpersonation(
  db: Database,
  token: string,
  actor: ImpersonationActor & { impersonator: { userId: string; label?: string } },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(sessions)
      .where(and(eq(sessions.token, token), eq(sessions.impersonatedBy, actor.impersonator.userId)));
    await auditChange(tx, {
      // The stop is the admin's own act: attribute it to them, not to the target.
      actor: { userId: actor.impersonator.userId, traceId: actor.traceId, label: actor.impersonator.label },
      event: "impersonation.stopped",
      subject: { type: "user", id: actor.userId },
    });
  });
}
