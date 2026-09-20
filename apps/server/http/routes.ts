import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import type { AppContext } from "../context.ts";
import { auditRoutes } from "../modules/audit/route.ts";
import { departmentRoutes } from "../modules/departments/route.ts";
import { requireActor } from "../modules/identity/policy.ts";
import { identityRoutes } from "../modules/identity/route.ts";
import { postRoutes } from "../modules/posts/route.ts";
import { rbacRoutes } from "../modules/rbac/route.ts";
import type { AppVariables } from "./app.ts";
import { ok } from "./errors.ts";

export const API_PREFIX = "/api/v1";

/** `http/routes.ts` hanya mendaftarkan route — tidak berisi business logic (PRD §6). */
export function registerRoutes(app: Hono<{ Variables: AppVariables }>, ctx: AppContext, organizationId: string): void {
  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/ready", async (c) => {
    const started = performance.now();
    await ctx.db.execute(sql`select 1`);
    return c.json({
      status: "ready",
      checks: { database: { ok: true, ms: Math.round(performance.now() - started) } },
    });
  });

  // Handler auth milik Better Auth — cookie/session tidak diduplikasi di sini.
  app.on(["GET", "POST"], `${API_PREFIX}/auth/*`, (c) => ctx.auth.handler(c.req.raw));

  app.get(`${API_PREFIX}/me`, async (c) => {
    const actor = await requireActor(c, ctx);
    return ok(c, {
      userId: actor.userId,
      organizationId: actor.organizationId,
      permissions: actor.permissions,
    });
  });

  app.route(`${API_PREFIX}/users`, identityRoutes(ctx, organizationId));
  app.route(`${API_PREFIX}/roles`, rbacRoutes(ctx, organizationId));
  app.route(`${API_PREFIX}/audit-logs`, auditRoutes(ctx, organizationId));
  app.route(`${API_PREFIX}/departments`, departmentRoutes(ctx, organizationId));
  app.route(`${API_PREFIX}/posts`, postRoutes(ctx, organizationId));
}
