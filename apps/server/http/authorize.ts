import { createMiddleware } from "hono/factory";
import type { AppContext } from "../context.ts";
import { requirePermission } from "../modules/identity/policy.ts";
import type { PermissionKey } from "../modules/rbac/statements.ts";
import type { AppVariables } from "./app.ts";

/** Authorization must run before validation, so anonymous malformed input still returns 401. */
export function authorize(ctx: AppContext, permission: PermissionKey) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    c.set("actor", await requirePermission(c, ctx, permission));
    await next();
  });
}
