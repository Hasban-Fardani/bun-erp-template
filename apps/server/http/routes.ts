import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import type { AppContext } from "../context.ts";
import { auditRoutes } from "../features/audit/route.ts";
import { departmentRoutes } from "../features/departments/route.ts";
import { requireActor } from "../features/identity/policy.ts";
import { identityRoutes } from "../features/identity/route.ts";
import { notificationRoutes } from "../features/notifications/route.ts";
import { rbacRoutes } from "../features/rbac/route.ts";
import { doc } from "./api-docs.ts";
import { ok } from "./errors.ts";
import type { AppVariables } from "./types.ts";

export const API_PREFIX = "/api/v1";

/** `http/routes.ts` only registers routes — it holds no business logic (PRD §6). */
export function registerRoutes(app: Hono<{ Variables: AppVariables }>, ctx: AppContext, organizationId: string) {
  return (
    app
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
      )

      .route(`${API_PREFIX}/users`, identityRoutes(ctx, organizationId))
      .route(`${API_PREFIX}/roles`, rbacRoutes(ctx, organizationId))
      .route(`${API_PREFIX}/audit-logs`, auditRoutes(ctx, organizationId))
      .route(`${API_PREFIX}/departments`, departmentRoutes(ctx, organizationId))
      .route(`${API_PREFIX}/notifications`, notificationRoutes(ctx))
  );
}
