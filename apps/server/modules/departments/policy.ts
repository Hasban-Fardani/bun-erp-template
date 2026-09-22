import type { PermissionKey } from "../rbac/statements.ts";

/** Maps module actions to permissions. Routes read from here — permissions are never hardcoded. */
export const ACTION_PERMISSION = {
  list: "department.read",
  read: "department.read",
  create: "department.create",
  update: "department.update",
  delete: "department.delete",
} as const satisfies Record<string, PermissionKey>;
