import { createMiddleware } from "hono/factory";
import type { AppContext } from "../context.ts";
import { requirePermission } from "../features/identity/policy.ts";
import type { PermissionKey } from "../features/rbac/statements.ts";
import type { AppVariables } from "./types.ts";

/** Authorization must run before validation, so anonymous malformed input still returns 401. */
export function authorize(ctx: AppContext, permission: PermissionKey) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    c.set("actor", await requirePermission(c, ctx, permission));
    await next();
  });
}
