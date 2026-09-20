import type { PermissionKey } from "../rbac/statements.ts";

/** Peta aksi modul ke permission — pola yang sama dengan departments. */
export const ACTION_PERMISSION = {
  list: "post.read",
  read: "post.read",
  create: "post.create",
  update: "post.update",
  delete: "post.delete",
} as const satisfies Record<string, PermissionKey>;
