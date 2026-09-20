/** Satu-satunya sumber izin yang dikenal kode; key = `<resource>.<action>`. */
export const statements = {
  // create/read/update/delete ditegakkan route user; `impersonate` menyusul bersama fiturnya.
  user: ["create", "read", "update", "delete", "impersonate"],
  // `assign` = menugaskan role ke user; kelola role & izinnya dijaga create/update/delete.
  role: ["create", "read", "update", "delete", "assign"],
  department: ["create", "read", "update", "delete"],
  audit: ["read"],
} as const;

export type Statement = typeof statements;
export type Resource = keyof Statement;
export type Action<R extends Resource> = Statement[R][number];

/** `user.create` — bentuk kanonik yang disimpan di tabel `permissions`. */
export type PermissionKey = { [R in Resource]: `${R}.${Action<R>}` }[Resource];

/** Daftar datar seluruh permission, dipakai seeding dan validasi. */
export const allPermissions: readonly PermissionKey[] = Object.entries(statements).flatMap(([resource, actions]) =>
  (actions as readonly string[]).map((action) => `${resource}.${action}` as PermissionKey),
) as readonly PermissionKey[];

/**
 * Role sistem: selalu ada, tidak bisa dihapus, dan dipakai sebagai jaring pengaman
 * supaya selalu ada jalur masuk ketika role buatan admin salah dikonfigurasi.
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
