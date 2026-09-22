import type { Context } from "hono";
import type { AppContext } from "../../context.ts";
import { ApiError } from "../../http/errors.ts";
import { permissionsForUser } from "../rbac/service.ts";
import type { PermissionKey } from "../rbac/statements.ts";

/**
 * Per-request identity. Built from the Better Auth session, not from client-sent
 * headers — headers can be forged, sessions cannot.
 */
export type Actor = {
  userId: string;
  organizationId: string | null;
  permissions: readonly PermissionKey[];
  traceId: string;
  /** Actor name as frozen text for the audit — names can change, records cannot. */
  label: string;
};

/**
 * Resolves the actor from the session. `null` means not logged in (401), not "not allowed"
 * (403) — the two are often swapped and that makes debugging hard.
 */
export async function resolveActor(c: Context, ctx: AppContext): Promise<Actor | null> {
  const session = await ctx.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return null;

  const user = session.user as {
    id: string;
    name?: string | null;
    email?: string | null;
    organizationId?: string | null;
  };
  return {
    userId: user.id,
    organizationId: user.organizationId ?? null,
    permissions: await permissionsForUser(ctx.db, user.id),
    traceId: (c.get("requestId") as string | undefined) ?? "",
    // Email outlives the display name, and stays readable during an investigation.
    label: user.email ?? user.name ?? "",
  };
}

/** Requires a login. Used by private routes; 401 when no session exists. */
export async function requireActor(c: Context, ctx: AppContext): Promise<Actor> {
  const actor = await resolveActor(c, ctx);
  if (!actor) throw ApiError.unauthorized();
  return actor;
}

/** Deny by default: `key` is typed PermissionKey, a bogus permission is rejected at compile time. */
export async function requirePermission(c: Context, ctx: AppContext, key: PermissionKey): Promise<Actor> {
  const actor = await requireActor(c, ctx);
  if (!actor.permissions.includes(key)) {
    throw ApiError.forbidden(`Missing permission: ${key}`);
  }
  return actor;
}
