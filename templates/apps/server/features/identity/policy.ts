import type { Context } from "hono";
import type { AppContext } from "../../bootstrap/context.ts";
import { ApiError } from "../../http/helpers/errors.ts";
import type { PermissionKey } from "../rbac/index.ts";
import { permissionsForUser } from "../rbac/index.ts";

/**
 * Per-request identity. Built from the Better Auth session, not from client-sent
 * headers — headers can be forged, sessions cannot.
 */
export type Actor = {
  userId: string;
  permissions: readonly PermissionKey[];
  traceId: string;
  /** Display name, so `/me` can answer the whole identity question in one request. */
  name: string;
  email: string;
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
  };
  return {
    userId: user.id,
    permissions: await permissionsForUser(ctx.db, user.id),
    traceId: (c.get("requestId") as string | undefined) ?? "",
    name: user.name ?? "",
    email: user.email ?? "",
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

/** Maps module actions to permissions. Routes read from here — permissions are never hardcoded. */
export const ACTION_PERMISSION = {
  list: "user.read",
  read: "user.read",
  create: "user.create",
  update: "user.update",
  delete: "user.delete",
  assignRole: "role.assign",
  replaceRoles: "role.assign",
  revokeRole: "role.assign",
} as const satisfies Record<string, PermissionKey>;
