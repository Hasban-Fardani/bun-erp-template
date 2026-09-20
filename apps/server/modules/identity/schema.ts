import * as z from "zod";

/**
 * Kontrak input HTTP untuk manajemen pengguna. Autentikasi (sign-up/sign-in) ditangani
 * Better Auth di `/api/v1/auth/*` — bukan di sini, dan tidak boleh diduplikasi.
 */

export const listUsersSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(120).optional(),
});

export const updateUserSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  // Perubahan organisasi hanya oleh yang punya `user.update`; nilainya dari server.
  organizationId: z.uuid().nullable().optional(),
  emailVerified: z.boolean().optional(),
});

export const assignRoleSchema = z.strictObject({
  roleKey: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "use lowercase letters, digits, dash, or underscore"),
  // Lingkup opsional: kosong berarti role berlaku di seluruh organisasi.
  scopeType: z.enum(["organization", "department"]).optional(),
  scopeId: z.uuid().optional(),
});

export const ListUsersInput = z.compile(listUsersSchema);
export const UpdateUserInput = z.compile(updateUserSchema);
export const AssignRoleInput = z.compile(assignRoleSchema);

export type ListUsersInput = z.output<typeof ListUsersInput>;
export type UpdateUserInput = z.output<typeof UpdateUserInput>;
export type AssignRoleInput = z.output<typeof AssignRoleInput>;
