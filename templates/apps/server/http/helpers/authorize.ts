import type { AppContext } from "../../bootstrap/context.ts";
import { requirePermission } from "../../features/identity/policy.ts";
import type { PermissionKey } from "../../features/rbac/statements.ts";
import { factory } from "../factory.ts";

/** Authorization must run before validation, so anonymous malformed input still returns 401. */
export function authorize(ctx: AppContext, permission: PermissionKey) {
  return factory.createMiddleware(async (c, next) => {
    c.set("actor", await requirePermission(c, ctx, permission));
    await next();
  });
}
