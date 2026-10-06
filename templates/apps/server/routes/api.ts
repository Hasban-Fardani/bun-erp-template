import { sql } from "drizzle-orm";
import type { AppContext } from "../bootstrap/context.ts";
import { auditFeature } from "../features/audit/feature.ts";
import { identityFeature } from "../features/identity/feature.ts";
import { requireActor } from "../features/identity/policy.ts";
import { notificationFeature } from "../features/notifications/feature.ts";
import { rbacFeature } from "../features/rbac/feature.ts";
import { factory } from "../http/factory.ts";
import { doc } from "../http/helpers/api-docs.ts";
import { ok } from "../http/helpers/errors.ts";
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
] as const satisfies readonly FeatureDefinition[];

/** `routes/api.ts` only registers routes — it holds no business logic (PRD §6). */
export function apiRoutes(ctx: AppContext, organizationId: string) {
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
            status: { type: "string" },
            checks: { type: "object", properties: { database: { type: "object" } } },
          },
        },
      }),
      async (c) => {
        const started = performance.now();
        await ctx.db.execute(sql`select 1`);
        return c.json({
          status: "ready",
          checks: { database: { ok: true, ms: Math.round(performance.now() - started) } },
        });
      },
    )

    // Auth handlers belong to Better Auth, so their routes are not built here and cannot carry
    // per-route docs; the operations the app uses are documented in `http/openapi.ts`.
    .on(["GET", "POST"], `${API_PREFIX}/auth/*`, (c) => ctx.auth.handler(c.req.raw))

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
            organizationId: { type: ["string", "null"] },
            permissions: { type: "array", items: { type: "string" } },
          },
        },
      }),
      async (c) => {
        const actor = await requireActor(c, ctx);
        return ok(c, {
          userId: actor.userId,
          name: actor.name,
          email: actor.email,
          organizationId: actor.organizationId,
          permissions: actor.permissions,
        });
      },
    );

  return registerFeatures(app, ctx, organizationId, FEATURES);
}
