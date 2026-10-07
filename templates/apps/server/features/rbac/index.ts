/** Public surface for the rbac feature; other features import it only through this file. */

export type { Role } from "./service.ts";
export { permissionsForUser, rolesForUser } from "./service.ts";
export type { Action, PermissionKey, Resource, Statement, SystemRoleKey } from "./statements.ts";
export { allPermissions, statements, systemRoles } from "./statements.ts";
