import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import type { AppContext } from "../context.ts";
import { departmentRoutes } from "../modules/departments/route.ts";
import type { AppVariables } from "./app.ts";

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

  app.route(`${API_PREFIX}/departments`, departmentRoutes(ctx, organizationId));
}
