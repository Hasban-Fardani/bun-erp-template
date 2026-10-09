import type { AppContext } from "../bootstrap/context.ts";
import { sessionOnce } from "../features/identity/policy.ts";
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

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
/** Loose IPv6 shape (hex groups, `::`, optional embedded IPv4); runtime-neutral, no `node:net`. */
const IPV6 = /^(?=.*:)[0-9a-f:.]+$/i;

/** Accepts only well-formed IPv4/IPv6 literals so junk header values cannot mint new buckets. */
function validIp(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || v.length > 45) return null;
  return IPV4.test(v) || IPV6.test(v) ? v : null;
}

/**
 * Cloudflare appends to `x-forwarded-for`, so its first entry is client-controlled; on that target
 * only `cf-connecting-ip` is read. Elsewhere the header is read only when `TRUST_PROXY` declares a
 * proxy (same rule as Better Auth). Anything that is not an IP shares the "unknown" bucket.
 */
function clientAddress(headers: Headers, env: { APP_DEPLOY_TARGET: string; TRUST_PROXY: boolean }): string {
  if (env.APP_DEPLOY_TARGET === "cloudflare") return validIp(headers.get("cf-connecting-ip")) ?? "unknown";
  if (!env.TRUST_PROXY) return "unknown";
  return validIp(headers.get("x-forwarded-for")?.split(",")[0]) ?? "unknown";
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
    const session = c.req.header("cookie") ? await sessionOnce(c, ctx) : null;
    const key = session?.user ? `user:${session.user.id}` : `ip:${clientAddress(c.req.raw.headers, env)}`;

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
