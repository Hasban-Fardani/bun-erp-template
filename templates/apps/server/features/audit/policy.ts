import type { PermissionKey } from "../rbac/statements.ts";

/** Maps module actions to permissions. Routes read from here — permissions are never hardcoded. */
export const ACTION_PERMISSION = {
  list: "audit.read",
} as const satisfies Record<string, PermissionKey>;
