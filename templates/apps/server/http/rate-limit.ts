import type { AppContext } from "../bootstrap/context.ts";
import { factory } from "./factory.ts";
import { hitApiRateLimit } from "./helpers/api-rate-limit.ts";
import { type ApiErrorBody, ErrorCode, requestId } from "./helpers/errors.ts";

const API_PREFIX = "/api/v1";
/** Probes are polled by orchestrators and load balancers; Better Auth limits its own endpoints. */
const UNLIMITED = new Set([`${API_PREFIX}/health`, `${API_PREFIX}/ready`]);

function isLimited(path: string): boolean {
  if (!path.startsWith(`${API_PREFIX}/`)) return false;
  return !UNLIMITED.has(path) && !path.startsWith(`${API_PREFIX}/auth/`);
}

/** Same rule as Better Auth: the header is read only when a trusted proxy is declared. */
function clientAddress(headers: Headers, trustProxy: boolean): string {
  if (!trustProxy) return "unknown";
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Per-caller fixed-window limit on `/api/v1/*`, stored in PostgreSQL so every replica or isolate
 * shares one budget. A session keys the bucket by user id; everything else falls back to the
 * client address. Without `TRUST_PROXY` all anonymous callers share one bucket, which cannot
 * starve signed-in users because those are keyed by user id.
 */
export function apiRateLimit(ctx: AppContext) {
  const { env } = ctx;
  return factory.createMiddleware(async (c, next) => {
    if (!env.API_RATE_LIMIT_ENABLED || !isLimited(c.req.path)) return next();

    // Only requests that carry a cookie pay for a session lookup.
    const session = c.req.header("cookie") ? await ctx.auth.api.getSession({ headers: c.req.raw.headers }) : null;
    const key = session?.user ? `user:${session.user.id}` : `ip:${clientAddress(c.req.raw.headers, env.TRUST_PROXY)}`;

    const hit = await hitApiRateLimit(ctx.db, {
      key,
      windowSeconds: env.API_RATE_LIMIT_WINDOW_SECONDS,
      nowMs: Date.now(),
    });
    if (hit.count <= env.API_RATE_LIMIT_MAX) return next();

    const body: ApiErrorBody = {
      error: {
        code: ErrorCode.rateLimited,
        message: "Too many requests",
        details: { retryAfter: hit.retryAfterSeconds },
      },
      meta: { requestId: requestId(c) },
    };
    return c.json(body, 429, { "Retry-After": String(hit.retryAfterSeconds) });
  });
}
