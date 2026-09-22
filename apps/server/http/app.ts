import { apiReference } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId as requestIdMiddleware } from "hono/request-id";
import { openAPIRouteHandler } from "hono-openapi";
import type { AppContext } from "../context.ts";
import { ApiError, type ApiErrorBody, ErrorCode, requestId } from "./errors.ts";
import { BETTER_AUTH_PATHS, BETTER_AUTH_TAGS, DOCUMENTATION, SCHEMAS, SECURITY_SCHEMES, SERVERS } from "./openapi.ts";
import { registerRoutes } from "./routes.ts";

export type AppVariables = { requestId: string };

/**
 * `ctx` disuntikkan lewat closure, `organizationId` diberikan saat bootstrap — Phase 2
 * menggantinya dengan organisasi milik session (per-request), bukan nilai tetap.
 */
export function createApp(ctx: AppContext, organizationId: string): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  /**
   * Spesifikasi dihasilkan dari router itu sendiri: path dan skema dibaca dari route nyata,
   * jadi dokumentasi tak bisa menyimpang dari implementasi.
   */
  app.get(
    "/api/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        openapi: "3.1.0",
        info: DOCUMENTATION(ctx.env),
        servers: SERVERS(ctx.env),
        tags: BETTER_AUTH_TAGS,
        paths: BETTER_AUTH_PATHS,
        components: { securitySchemes: SECURITY_SCHEMES, schemas: SCHEMAS },
      },
    }),
  );
  app.get("/api/docs", apiReference({ url: "/api/openapi.json", pageTitle: "Bun ERP Template API" }));

  app.use(requestIdMiddleware({ limitLength: 128, headerName: "X-Request-Id" }));

  // Deployment hybrid (ADR-0011): web di domain sendiri, jadi klinta lintas origin.
  // Allowlist = AUTH_TRUSTED_ORIGINS — origin lain tak mendapat header CORS sama sekali.
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (ctx.env.trustedOrigins.includes(origin) ? origin : null),
      credentials: true,
      allowHeaders: ["content-type"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      maxAge: 86_400,
    }),
  );

  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    const elapsed = performance.now() - started;
    // Hanya request gagal/lambat yang dicatat — log per-request sukses = alarm fog.
    if (c.res.status >= 400 || elapsed > 1000) {
      ctx.logger.warn({
        event: "http.request.slow_or_failed",
        trace_id: requestId(c),
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        duration_ms: Math.round(elapsed),
      });
    }
  });

  registerRoutes(app, ctx, organizationId);

  app.notFound(() => {
    throw ApiError.notFound();
  });

  app.onError((err, c) => {
    const id = requestId(c);
    if (err instanceof ApiError) {
      const body: ApiErrorBody = {
        error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
        meta: { requestId: id },
      };
      return c.json(body, err.status as 400);
    }

    // Kegagalan tak terduga: jejak penuh di log server, pesan aman untuk klien.
    ctx.logger.error({
      event: "http.request.failed",
      trace_id: id,
      method: c.req.method,
      path: c.req.path,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    const body: ApiErrorBody = {
      error: { code: ErrorCode.internal, message: "Internal server error" },
      meta: { requestId: id },
    };
    return c.json(body, 500);
  });

  return app;
}
