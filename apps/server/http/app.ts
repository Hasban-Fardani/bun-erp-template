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
 * `ctx` is injected via closure, `organizationId` is set at bootstrap — Phase 2
 * replaces it with the session's own organization (per-request), not a fixed value.
 */
export function createApp(ctx: AppContext, organizationId: string): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  /**
   * The spec is generated from the router itself: paths and schemas are read from real routes,
   * so docs cannot drift from the implementation.
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

  // Hybrid deployment (ADR-0011): web lives on its own domain, so the client crosses origins.
  // Allowlist = AUTH_TRUSTED_ORIGINS — any other origin gets no CORS headers at all.
  // Applied to every path, not just `/api/*`: the login screen reads `/health` and `/ready`
  // before a session exists, and a preflight that 404s would hide a degraded backend from the
  // person best placed to notice it.
  app.use(
    "*",
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
    // Only failed/slow requests are logged — per-request success logs drown the signal.
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

    // Unexpected failure: full trace in the server log, safe message for the client.
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
