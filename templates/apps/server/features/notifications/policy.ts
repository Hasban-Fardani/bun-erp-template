import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { requireActor } from "../identity/index.ts";

/**
 * Self-scoped module: every route reads or writes the signed-in actor's own rows, so the policy is
 * "authenticated" and no permission key applies. The middleware runs before validation, so an
 * anonymous request with malformed input is still 401; a future permission gate changes this file only.
 */
export function authorizeActor(ctx: AppContext) {
  return factory.createMiddleware(async (c, next) => {
    c.set("actor", await requireActor(c, ctx));
    await next();
  });
}
