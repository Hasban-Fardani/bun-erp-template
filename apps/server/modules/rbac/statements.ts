/**
 * Katalog statemen — satu-satunya sumber kebenaran izin yang dikenal kode (PRD §RBAC).
 *
 * Ditulis di kode, bukan di database, karena kode yang memanggil `authorize("user.create")`
 * harus gagal saat compile bila izinnya tidak ada. Role (kumpulan izin) tetap dinamis
 * di database; yang statis hanya daftar aksinya.
 *
 * Format key: `<resource>.<action>`.
 */
export const statements = {
  user: ["create", "read", "update", "delete", "impersonate"],
  // Hanya `read` dan `assign` yang ditegakkan route saat ini. `create`/`update`/`delete`
  // sengaja belum masuk katalog: role sistem berasal dari kode (`systemRoles`), dan
  // menambahkan izin tanpa route yang menegakkannya hanya membuat katalog berbohong.
  role: ["read", "assign"],
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
