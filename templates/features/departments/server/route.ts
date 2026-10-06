import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { authorize } from "../../http/helpers/authorize.ts";
import { ApiError, ok } from "../../http/helpers/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/helpers/list-query.ts";
import { idParam } from "../../http/helpers/params.ts";
import { validate } from "../../http/helpers/validate.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import {
  createDepartment,
  deleteDepartment,
  findDepartment,
  forceDeleteDepartment,
  listDepartments,
  restoreDepartment,
  updateDepartment,
} from "./service.ts";
import { CreateDepartmentInput, ListDepartmentsInput, UpdateDepartmentInput } from "./validation.ts";

const departmentRef = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    code: { type: "string" },
    isActive: { type: "boolean" },
    deletedAt: { type: "string", format: "date-time", nullable: true },
    version: { type: "integer" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const listData = {
  type: "object",
  properties: { items: { type: "array", items: departmentRef }, ...listMetaSchemaProperties },
};

/** Thin route: validation → policy → service → envelope (PRD §6). No business logic here. */
export function departmentRoutes(ctx: AppContext) {
  return factory
    .createApp()
    .get(
      "/",
      authorize(ctx, ACTION_PERMISSION.list),
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.list,
        summary: "Daftar departemen",
        query: ListDepartmentsInput,
        data: listData,
      }),

      validate("query", ListDepartmentsInput),
      async (c) => {
        const input = c.req.valid("query");
        const { items, total } = await listDepartments(ctx.db, input);
        return ok(c, { items, ...listMeta(input, total) });
      },
    )
    .get(
      "/:id",
      authorize(ctx, ACTION_PERMISSION.read),
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.read,
        summary: "Detail departemen",
        data: departmentRef,
      }),

      validate("param", idParam),
      async (c) => {
        const department = await findDepartment(ctx.db, c.req.param("id"));
        // Absent = 404. 403 is only for a failed authorization (PRD §12).
        if (!department) throw ApiError.notFound("Department not found");
        return ok(c, department);
      },
    )
    .post(
      "/",
      authorize(ctx, ACTION_PERMISSION.create),
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.create,
        summary: "Buat departemen",
        body: CreateDepartmentInput,
        data: departmentRef,
      }),

      validate("json", CreateDepartmentInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(c, await createDepartment(ctx.db, input, actor));
      },
    )
    .patch(
      "/:id",
      authorize(ctx, ACTION_PERMISSION.update),
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.update,
        summary: "Ubah departemen",
        body: UpdateDepartmentInput,
        data: departmentRef,
      }),

      validate("param", idParam),
      validate("json", UpdateDepartmentInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(c, await updateDepartment(ctx.db, c.req.param("id"), input, actor));
      },
    )
    .delete(
      "/:id",
      authorize(ctx, ACTION_PERMISSION.delete),
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.delete,
        summary: "Hapus departemen (soft delete)",
        data: departmentRef,
      }),

      validate("param", idParam),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await deleteDepartment(ctx.db, c.req.param("id"), actor));
      },
    )
    .post(
      "/:id/restore",
      authorize(ctx, ACTION_PERMISSION.delete),
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.delete,
        summary: "Pulihkan departemen",
        data: departmentRef,
      }),

      validate("param", idParam),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await restoreDepartment(ctx.db, c.req.param("id"), actor));
      },
    )
    .delete(
      "/:id/force",
      authorize(ctx, ACTION_PERMISSION.delete),
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.delete,
        summary: "Hapus departemen permanen",
        data: departmentRef,
      }),

      validate("param", idParam),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await forceDeleteDepartment(ctx.db, c.req.param("id"), actor));
      },
    );
}
