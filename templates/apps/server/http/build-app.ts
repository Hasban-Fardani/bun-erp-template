import type { Handler } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import type { AppContext } from "../bootstrap/context.ts";
import { apiRoutes } from "../routes/api.ts";
import { registerErrorHandler } from "./error-handler.ts";
import { factory } from "./factory.ts";
import { registerMiddleware } from "./middleware.ts";
import { BETTER_AUTH_PATHS, BETTER_AUTH_TAGS, DOCUMENTATION, SCHEMAS, SECURITY_SCHEMES, SERVERS } from "./openapi.ts";

/** Builds the HTML reference page for the spec. Only the Bun target supplies one (see `app.ts`). */
export type DocsUiFactory = (specUrl: string, title: string) => Handler;

/**
 * Runtime-neutral application builder. It never imports the API reference UI: the Cloudflare
 * Worker graph imports this module so the Scalar bundle stays out of the Worker script, and the
 * Bun entry point (`app.ts`) passes the UI in.
 */
export function buildApp(ctx: AppContext, docsUi?: DocsUiFactory) {
  const app = factory.createApp();
  registerMiddleware(app, ctx);

  /**
   * The spec is generated from the router itself: paths and schemas are read from real routes,
   * so docs cannot drift from the implementation. It exposes the whole surface, so the routes
   * are registered only when `apiDocsEnabled` says so (off by default in production;
   * `API_DOCS_ENABLED=true` opts in explicitly — see docs/security.md).
   */
  if (ctx.env.apiDocsEnabled) {
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
    if (docsUi) app.get("/api/docs", docsUi("/api/openapi.json", "Bun ERP Template API"));
  }

  const routes = app.route("/", apiRoutes(ctx));

  registerErrorHandler(app, ctx);

  return routes;
}
