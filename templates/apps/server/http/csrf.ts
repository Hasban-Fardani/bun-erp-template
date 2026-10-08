import type { AppContext } from "../bootstrap/context.ts";
import { factory } from "./factory.ts";
import { ApiError } from "./helpers/errors.ts";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const API_PREFIX = "/api/v1";

/**
 * Cookie sessions make cross-site writes possible, so an unsafe request that declares an `Origin`
 * must come from this app's own origin, `APP_URL`, or an `AUTH_TRUSTED_ORIGINS` entry (the same
 * list CORS uses). Browsers always send `Origin` on cross-origin writes, so a request without one
 * is a non-browser client (CLI, server-to-server), except when Fetch Metadata still says the
 * browser made it cross-site. Better Auth enforces the same trusted-origin rule on `/api/auth/*`
 * itself, so the Better Auth routes are left to it.
 */
export function csrfProtection(ctx: AppContext) {
  const allowed = new Set([new URL(ctx.env.APP_URL).origin, ...ctx.env.trustedOrigins]);
  return factory.createMiddleware(async (c, next) => {
    if (!UNSAFE_METHODS.has(c.req.method)) return next();
    if (!c.req.path.startsWith(`${API_PREFIX}/`) || c.req.path.startsWith(`${API_PREFIX}/auth/`)) return next();

    const origin = c.req.header("origin");
    if (origin !== undefined) {
      if (origin === new URL(c.req.url).origin || allowed.has(origin)) return next();
      throw ApiError.forbidden("Cross-origin request refused");
    }
    if (c.req.header("sec-fetch-site") === "cross-site") throw ApiError.forbidden("Cross-origin request refused");
    return next();
  });
}
