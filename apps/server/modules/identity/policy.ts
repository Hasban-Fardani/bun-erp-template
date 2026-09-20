import type { Context } from "hono";
import type { AppContext } from "../../context.ts";
import { ApiError } from "../../http/errors.ts";
import { permissionsForUser } from "../rbac/service.ts";
import type { PermissionKey } from "../rbac/statements.ts";

/**
 * Identitas per-request. Dibangun dari session Better Auth, bukan dari header yang
 * dikirim klien — header bisa dikarang, session tidak.
 */
export type Actor = {
  userId: string;
  organizationId: string | null;
  permissions: readonly PermissionKey[];
  traceId: string;
  /** Nama pelaku sebagai teks beku untuk audit — nama bisa berubah, catatan tidak. */
  label: string;
};

/**
 * Menyelesaikan aktor dari session. `null` berarti belum login (401), bukan "tidak boleh"
 * (403) — dua hal itu sering tertukar dan membuat debugging sulit.
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
    // Email lebih tahan lama daripada nama tampilan, dan tetap terbaca saat investigasi.
    label: user.email ?? user.name ?? "",
  };
}

/** Wajib login. Dipakai route privat; 401 bila belum ada session. */
export async function requireActor(c: Context, ctx: AppContext): Promise<Actor> {
  const actor = await resolveActor(c, ctx);
  if (!actor) throw ApiError.unauthorized();
  return actor;
}

/** Deny by default: `key` bertipe PermissionKey, izin ngawur ditolak saat compile. */
export async function requirePermission(c: Context, ctx: AppContext, key: PermissionKey): Promise<Actor> {
  const actor = await requireActor(c, ctx);
  if (!actor.permissions.includes(key)) {
    throw ApiError.forbidden(`Missing permission: ${key}`);
  }
  return actor;
}
