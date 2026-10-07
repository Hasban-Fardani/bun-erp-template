/**
 * Public surface of the RBAC feature. Other features import from here only — the
 * `feature-boundary` rule in `check:architecture` rejects deep imports — so extracting RBAC as a
 * service means moving the folder and repointing this entry. The join tables are public because
 * identity manages role assignments inside its own transaction.
 */
export { invalidateUser } from "./cache.ts";
export { permissions, rolePermissions, roles, userRoles } from "./schema.ts";
export {
  assignRole,
  countUsersWithRoleKey,
  findRoleByKey,
  permissionsForRole,
  permissionsForRoles,
  permissionsForUser,
  revokeRole,
  userHoldsRoleKey,
} from "./service.ts";
export type { PermissionKey } from "./statements.ts";
