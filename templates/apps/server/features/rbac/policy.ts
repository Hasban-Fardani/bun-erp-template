import type { PermissionKey } from "../rbac/statements.ts";

/**
 * Maps module actions to permissions. Routes read from here — permissions are never hardcoded.
 * `setPermissions` is a distinct action guarded by the same `role.update` permission.
 */
export const ACTION_PERMISSION = {
  list: "role.read",
  create: "role.create",
  update: "role.update",
  delete: "role.delete",
  setPermissions: "role.update",
  statements: "role.read",
} as const satisfies Record<string, PermissionKey>;
