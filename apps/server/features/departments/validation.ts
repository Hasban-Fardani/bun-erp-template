import * as z from "zod";
import { listQueryParts } from "../../http/list-query.ts";

/**
 * The module's HTTP input contract. Raw definitions are exported so the parity test (F1.16)
 * can compare compiled vs uncompiled from the same definition, not from a copy.
 */
export const createDepartmentSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .regex(/^[A-Z0-9-]+$/, "use uppercase letters, digits, or dashes"),
});

export const updateDepartmentSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .regex(/^[A-Z0-9-]+$/)
    .optional(),
});

export const listDepartmentsSchema = z.strictObject({
  ...listQueryParts({ sortable: ["name", "code", "createdAt"], defaultSort: "name" }),
  search: z.string().trim().max(120).optional(),
});

export const CreateDepartmentInput = z.compile(createDepartmentSchema);
export const UpdateDepartmentInput = z.compile(updateDepartmentSchema);
export const ListDepartmentsInput = z.compile(listDepartmentsSchema);

export type CreateDepartmentInput = z.output<typeof CreateDepartmentInput>;
export type UpdateDepartmentInput = z.output<typeof UpdateDepartmentInput>;
export type ListDepartmentsInput = z.output<typeof ListDepartmentsInput>;
