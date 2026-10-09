import type { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId as requestIdMiddleware } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import type { AppContext } from "../bootstrap/context.ts";
import { csrfProtection } from "./csrf.ts";
import { type AppEnv, factory } from "./factory.ts";
import { requestId } from "./helpers/errors.ts";
import { maintenanceMode } from "./maintenance.ts";
import { queryBudget } from "./query-budget.ts";
import { apiRateLimit } from "./rate-limit.ts";

export function registerMiddleware(app: Hono<AppEnv>, ctx: AppContext) {
  app.use(
    "*",
    secureHeaders({
      referrerPolicy: "strict-origin-when-cross-origin",
      strictTransportSecurity: ctx.env.isProduction ? "max-age=15552000" : false,
      xFrameOptions: "DENY",
    }),
  );
  app.use(requestIdMiddleware({ limitLength: 128, headerName: "X-Request-Id" }));

  // Credentialed requests receive CORS headers only for explicitly trusted origins.
  app.use(
    "*",
    cors({
      origin: (origin) => (ctx.env.trustedOrigins.includes(origin) ? origin : null),
      credentials: true,
      allowHeaders: ["content-type", "x-request-id"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      maxAge: 86_400,
    }),
  );

  app.use("*", queryBudget(ctx));
  app.use("*", csrfProtection(ctx));
  app.use("*", maintenanceMode(ctx));
  app.use("*", apiRateLimit(ctx));

  app.use(
    factory.createMiddleware(async (c, next) => {
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
    }),
  );
}
