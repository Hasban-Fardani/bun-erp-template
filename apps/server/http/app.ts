import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import type { AppContext } from "../context.ts";
import { registerErrorHandler } from "./error-handler.ts";
import { registerMiddleware } from "./middleware.ts";
import { BETTER_AUTH_PATHS, BETTER_AUTH_TAGS, DOCUMENTATION, SCHEMAS, SECURITY_SCHEMES, SERVERS } from "./openapi.ts";
import { registerRoutes } from "./routes.ts";
import type { AppVariables } from "./types.ts";

export function createApp(ctx: AppContext, organizationId: string) {
  const app = new Hono<{ Variables: AppVariables }>();
  registerMiddleware(app, ctx);

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
  app.get("/api/docs", Scalar({ url: "/api/openapi.json", pageTitle: "Bun ERP Template API" }));

  const routes = registerRoutes(app, ctx, organizationId);

  registerErrorHandler(app, ctx);

  return routes;
}
