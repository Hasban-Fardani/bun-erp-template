import { Hono } from "hono";
import { requestId as requestIdMiddleware } from "hono/request-id";
import type { AppContext } from "../context.ts";
import { ApiError, type ApiErrorBody, ErrorCode, requestId } from "./errors.ts";
import { registerRoutes } from "./routes.ts";

export type AppVariables = { requestId: string };

/**
 * `ctx` disuntikkan lewat closure, `organizationId` diberikan saat bootstrap — Phase 2
 * menggantinya dengan organisasi milik session (per-request), bukan nilai tetap.
 */
export function createApp(ctx: AppContext, organizationId: string): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use(requestIdMiddleware({ limitLength: 128, headerName: "X-Request-Id" }));

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
