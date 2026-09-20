import * as z from "zod";

/** Kontrak input pengelolaan role. `key` huruf kecil stabil — dipakai kode & audit. */
const keySchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9_-]+$/, "use lowercase letters, digits, dash, or underscore");

export const createRoleSchema = z.strictObject({
  key: keySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
});

export const updateRoleSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
});

export const setRolePermissionsSchema = z.strictObject({
  permissions: z.array(z.string().trim().min(1)).max(100),
});

export const CreateRoleInput = z.compile(createRoleSchema);
export const UpdateRoleInput = z.compile(updateRoleSchema);
export const SetRolePermissionsInput = z.compile(setRolePermissionsSchema);

export type CreateRoleInput = z.output<typeof CreateRoleInput>;
export type UpdateRoleInput = z.output<typeof UpdateRoleInput>;
export type SetRolePermissionsInput = z.output<typeof SetRolePermissionsInput>;
