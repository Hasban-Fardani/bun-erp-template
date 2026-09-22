import * as z from "zod";
import { listQueryParts } from "../../http/list-query.ts";

/**
 * HTTP input contract for user management. Authentication (sign-up/sign-in) is handled by
 * Better Auth at `/api/v1/auth/*` — not here, and must never be duplicated.
 */

export const listUsersSchema = z.strictObject({
  ...listQueryParts({ sortable: ["name", "email", "createdAt"], defaultSort: "name" }),
  search: z.string().trim().max(120).optional(),
});

export const createUserSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.email().transform((v) => v.trim().toLowerCase()),
  // The admin sets the initial password; users change it themselves once the mail driver (Phase 3) lands.
  password: z.string().min(10).max(200),
  roleKey: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "use lowercase letters, digits, dash, or underscore")
    .optional(),
});

export const updateUserSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  // Only a holder of `user.update` can change the organization; the value comes from the server.
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
  // Scope is optional: empty means the role applies to the whole organization.
  scopeType: z.enum(["organization", "department"]).optional(),
  scopeId: z.uuid().optional(),
});

export const ListUsersInput = z.compile(listUsersSchema);
export const UpdateUserInput = z.compile(updateUserSchema);
export const AssignRoleInput = z.compile(assignRoleSchema);
export const CreateUserInput = z.compile(createUserSchema);

export type ListUsersInput = z.output<typeof ListUsersInput>;
export type UpdateUserInput = z.output<typeof UpdateUserInput>;
export type AssignRoleInput = z.output<typeof AssignRoleInput>;
export type CreateUserInput = z.output<typeof CreateUserInput>;
