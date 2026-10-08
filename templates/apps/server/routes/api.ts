import { sql } from "drizzle-orm";
import { deleteCookie, getCookie } from "hono/cookie";
import type { AppContext } from "../bootstrap/context.ts";
import { auditFeature } from "../features/audit/feature.ts";
import { identityFeature } from "../features/identity/feature.ts";
import { IMPERSONATION_COOKIE, isBlockedAuthPath, stopImpersonation } from "../features/identity/impersonation.ts";
import { requireActor } from "../features/identity/policy.ts";
import { notificationFeature } from "../features/notifications/feature.ts";
import { rbacFeature } from "../features/rbac/feature.ts";
import { storageFeature } from "../features/storage/feature.ts";
import { factory } from "../http/factory.ts";
import { doc } from "../http/helpers/api-docs.ts";
import { ApiError, ok } from "../http/helpers/errors.ts";
import { type FeatureDefinition, registerFeatures } from "../http/helpers/feature.ts";

export const API_PREFIX = "/api/v1";

/**
 * Every server feature declares itself in its own module; this array fixes the mount order, and
 * `registerFeatures` mounts them through `app.route()` so the Hono RPC contract stays typed.
 */
const FEATURES = [
  identityFeature,
  rbacFeature,
  auditFeature,
  notificationFeature,
  storageFeature,
  // @erp:routes
] as const satisfies readonly FeatureDefinition[];

/** `routes/api.ts` only registers routes — it holds no business logic (PRD §6). */
export function apiRoutes(ctx: AppContext) {
  const app = factory
    .createApp()
    .get(
      `${API_PREFIX}/health`,
      doc({
        public: true,
        summary: "Status proses",
        data: { type: "object", properties: { status: { type: "string", enum: ["ok"] } } },
      }),
      (c) => c.json({ status: "ok" }),
    )
    .get(
      `${API_PREFIX}/ready`,
      doc({
        public: true,
        summary: "Status kesiapan + cek database",
        data: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ready", "unavailable"] },
            checks: { type: "object", properties: { database: { type: "object" } } },
          },
        },
      }),
      async (c) => {
        const started = performance.now();
        try {
          await ctx.db.execute(sql`select 1`);
        } catch {
          // A readiness probe acts on the status code, so an unavailable dependency is 503, not 500.
          ctx.logger.error({ event: "ready.database_failed" });
          return c.json(
            {
              status: "unavailable",
              checks: { database: { ok: false, ms: Math.round(performance.now() - started) } },
            },
            503,
          );
        }
        return c.json({
          status: "ready",
          checks: { database: { ok: true, ms: Math.round(performance.now() - started) } },
        });
      },
    )

    .get(
      `${API_PREFIX}/auth-options`,
      doc({
        public: true,
        tag: "auth",
        summary: "Metode masuk yang aktif",
        data: {
          type: "object",
          properties: { password: { type: "boolean" }, google: { type: "boolean" } },
        },
      }),
      (c) =>
        ok(c, {
          password: ctx.env.AUTH_PASSWORD_ENABLED,
          google: ctx.env.GOOGLE_CLIENT_ID !== "" && ctx.env.GOOGLE_CLIENT_SECRET !== "",
        }),
    )

    // Auth handlers belong to Better Auth, so their routes are not built here and cannot carry
    // per-route docs; the operations the app uses are documented in `http/openapi.ts`.
    // While an impersonation cookie is present, credential self-service would hit the ADMIN's own
    // Better Auth account; refuse it so the target's password, email, sessions and 2FA stay put.
    .on(["GET", "POST"], `${API_PREFIX}/auth/*`, (c) => {
      if (getCookie(c, IMPERSONATION_COOKIE) && isBlockedAuthPath(c.req.path.slice(`${API_PREFIX}/auth`.length))) {
        throw ApiError.forbidden("Not allowed while impersonating");
      }
      return ctx.auth.handler(c.req.raw);
    })

    .get(
      `${API_PREFIX}/me`,
      doc({
        tag: "auth",
        summary: "Identitas + izin sesi aktif",
        data: {
          type: "object",
          properties: {
            userId: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
            permissions: { type: "array", items: { type: "string" } },
            impersonation: {
              type: ["object", "null"],
              description: "Set while an admin views the app as this user.",
            },
          },
        },
      }),
      async (c) => {
        const actor = await requireActor(c, ctx);
        return ok(c, {
          userId: actor.userId,
          name: actor.name,
          email: actor.email,
          permissions: actor.permissions,
          impersonation: actor.impersonator
            ? {
                by: {
                  userId: actor.impersonator.userId,
                  name: actor.impersonator.name,
                  email: actor.impersonator.email,
                },
                expiresAt: actor.impersonator.expiresAt,
              }
            : null,
        });
      },
    )

    .post(
      `${API_PREFIX}/impersonation/stop`,
      doc({
        tag: "auth",
        summary: "Hentikan impersonasi dan kembali ke sesi asli",
        data: { type: "object", properties: { stopped: { type: "boolean" } } },
      }),
      async (c) => {
        const actor = await requireActor(c, ctx);
        if (!actor.impersonator) throw ApiError.notFound("No active impersonation");
        await stopImpersonation(ctx.db, actor.impersonator.token, { ...actor, impersonator: actor.impersonator });
        deleteCookie(c, IMPERSONATION_COOKIE, { path: "/" });
        return ok(c, { stopped: true });
      },
    );

  return registerFeatures(app, ctx, FEATURES);
}
