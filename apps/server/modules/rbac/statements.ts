/** The only source of permissions the code knows; key = `<resource>.<action>`. */
export const statements = {
  // create/read/update/delete are enforced by the user routes; `impersonate` follows with its feature.
  user: ["create", "read", "update", "delete", "impersonate"],
  // `assign` = granting a role to a user; managing roles & their permissions is guarded by create/update/delete.
  role: ["create", "read", "update", "delete", "assign"],
  department: ["create", "read", "update", "delete"],
  audit: ["read"],
} as const;

export type Statement = typeof statements;
export type Resource = keyof Statement;
export type Action<R extends Resource> = Statement[R][number];

/** `user.create` — the canonical form stored in the `permissions` table. */
export type PermissionKey = { [R in Resource]: `${R}.${Action<R>}` }[Resource];

/** Flat list of every permission, used for seeding and validation. */
export const allPermissions: readonly PermissionKey[] = Object.entries(statements).flatMap(([resource, actions]) =>
  (actions as readonly string[]).map((action) => `${resource}.${action}` as PermissionKey),
) as readonly PermissionKey[];

/**
 * System roles: always present, cannot be deleted, and act as the safety net
 * so a way in always exists when an admin-built role is misconfigured.
 */
export const systemRoles = {
  owner: {
    name: "Owner",
    description: "Akses penuh, termasuk mengelola role dan pengguna.",
    permissions: allPermissions,
  },
  staff: {
    name: "Staff",
    description: "Membaca data dan mengubah profilnya sendiri.",
    permissions: ["user.read", "department.read"] as readonly PermissionKey[],
  },
} as const satisfies Record<string, { name: string; description: string; permissions: readonly PermissionKey[] }>;

export type SystemRoleKey = keyof typeof systemRoles;
