/** The only source of permissions the code knows; key = `<resource>.<action>`. */
export const statements = {
  // Every key must have an enforcement site (tests/features/rbac/permission-enforcement.test.ts).
  // `impersonate` = view the app as another user for a limited time, fully audited (docs/security.md).
  user: ["create", "read", "update", "delete", "impersonate"],
  // `assign` = granting a role to a user; managing roles & their permissions is guarded by create/update/delete.
  role: ["create", "read", "update", "delete", "assign"],
  // @erp:permissions
  audit: ["read"],
  // `use` = ask the built-in assistant; every question counts against AI_DAILY_LIMIT (docs/ai.md).
  ai: ["use"],
  // `maintenance_bypass` lets a session keep using the API while `bun erp down` is active.
  app: ["maintenance_bypass"],
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
    description: "Membaca data, mengubah profilnya sendiri, dan bertanya ke asisten AI.",
    permissions: ["user.read", "ai.use"] as readonly PermissionKey[],
  },
} as const satisfies Record<string, { name: string; description: string; permissions: readonly PermissionKey[] }>;

export type SystemRoleKey = keyof typeof systemRoles;
