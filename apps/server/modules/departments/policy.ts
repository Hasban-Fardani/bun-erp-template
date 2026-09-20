import type { PermissionKey } from "../rbac/statements.ts";

/** Peta aksi modul ke permission. Route membaca dari sini — permission tidak pernah hardcode. */
export const ACTION_PERMISSION = {
  list: "department.read",
  read: "department.read",
  create: "department.create",
  update: "department.update",
  delete: "department.delete",
} as const satisfies Record<string, PermissionKey>;
