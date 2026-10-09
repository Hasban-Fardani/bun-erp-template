import type { Context } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import type { AppContext } from "../../bootstrap/context.ts";
import { ApiError } from "../../http/helpers/errors.ts";
import type { PermissionKey } from "../rbac/index.ts";
import { permissionsForUser } from "../rbac/index.ts";
import { IMPERSONATION_COOKIE, resolveImpersonation } from "./impersonation.ts";

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
  /**
   * Present while an admin views the app as this user: `userId` is the target, `impersonator` the
   * admin. Audit rows written from this actor carry both ids.
   */
  impersonator?: { userId: string; name: string; email: string; label: string; token: string; expiresAt: Date };
};

type SessionResult = Awaited<ReturnType<AppContext["auth"]["api"]["getSession"]>>;
const sessionByRequest = new WeakMap<Request, Promise<SessionResult>>();

/**
 * Looks the Better Auth session up once per request. The rate limiter, the maintenance gate and
 * the route policy all need it, and each lookup is a database round trip; keying the promise by the
 * raw `Request` shares one lookup without any state outliving the request.
 */
export function sessionOnce(c: Context, ctx: AppContext): Promise<SessionResult> {
  const request = c.req.raw;
  let pending = sessionByRequest.get(request);
  if (!pending) {
    pending = ctx.auth.api.getSession({ headers: request.headers });
    sessionByRequest.set(request, pending);
  }
  return pending;
}

/**
 * Resolves the actor from the session. `null` means not logged in (401), not "not allowed"
 * (403) — the two are often swapped and that makes debugging hard.
 */
export async function resolveActor(c: Context, ctx: AppContext): Promise<Actor | null> {
  const session = await sessionOnce(c, ctx);
  if (!session?.user) return null;

  const user = session.user as {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  const base = {
    traceId: (c.get("requestId") as string | undefined) ?? "",
  };

  // The impersonation token is checked against the admin's own live session: when that session
  // ends, so does the impersonation. A dead token clears its cookie and answers 401; the admin's
  // original session is untouched, so the next request works.
  const token = getCookie(c, IMPERSONATION_COOKIE);
  if (token) {
    const resolved = await resolveImpersonation(ctx.db, token, user.id);
    if (resolved.state !== "active") {
      deleteCookie(c, IMPERSONATION_COOKIE, { path: "/" });
      return null;
    }
    const target = resolved.target;
    return {
      ...base,
      userId: target.id,
      permissions: await permissionsForUser(ctx.db, target.id),
      name: target.name,
      email: target.email,
      label: target.email,
      impersonator: {
        userId: user.id,
        name: user.name ?? "",
        email: user.email ?? "",
        label: user.email ?? user.name ?? "",
        token,
        expiresAt: resolved.expiresAt,
      },
    };
  }

  return {
    ...base,
    userId: user.id,
    permissions: await permissionsForUser(ctx.db, user.id),
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
  impersonate: "user.impersonate",
} as const satisfies Record<string, PermissionKey>;
