import type { AppContext } from "../bootstrap/context.ts";
import { factory } from "./factory.ts";

/**
 * Maximum SQL statements per request, by `METHOD /route/pattern`. Every statement spends Hyperdrive's
 * quota on Cloudflare Workers Free (100k/day) and a database round trip on every target, so a route's
 * query count is a reviewed number. Add the route here when you add it; `query-budget.test.ts` fails
 * when a measured route exceeds its entry, and production logs `http.query_budget_exceeded`.
 * Measured on a warm isolate with the permission cache off (the Workers case) with the default stack (session, user, API rate limit, then the handler).
 */
export const QUERY_BUDGETS: Readonly<Record<string, number>> = {
  "GET /api/v1/me": 4,
  "GET /api/v1/users": 8,
  "GET /api/v1/notifications/unread-count": 5,
};

/** Routes without an entry must still stay under this; raise it only with a reason. */
export const DEFAULT_QUERY_BUDGET = 12;

/**
 * Measures statements per request. Outside production it adds `Server-Timing: db;desc="N queries"`
 * (visible in browser devtools); in production nothing is exposed and only an over-budget request
 * logs one warning with counts, never statement text.
 */
export function queryBudget(
  ctx: AppContext,
  budgets: Readonly<Record<string, number>> = QUERY_BUDGETS,
  fallback = DEFAULT_QUERY_BUDGET,
) {
  return factory.createMiddleware(async (c, next) => {
    const before = ctx.queries.count();
    await next();
    const used = ctx.queries.count() - before;
    const matched = c.req.matchedRoutes.findLast((r) => r.path !== "/*" && r.path !== "*");
    const route = `${c.req.method} ${matched?.path ?? c.req.path}`;
    const budget = budgets[route] ?? fallback;
    if (!ctx.env.isProduction) c.res.headers.set("Server-Timing", `db;desc="${used} queries"`);
    if (used > budget) {
      ctx.logger.warn({ event: "http.query_budget_exceeded", route, queries: used, budget });
    }
  });
}
