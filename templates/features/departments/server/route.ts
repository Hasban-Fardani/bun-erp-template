import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { authorize } from "../../http/helpers/authorize.ts";
import { ApiError, ok } from "../../http/helpers/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/helpers/list-query.ts";
import { validate } from "../../http/helpers/validate.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import { createDepartment, findDepartment, listDepartments, updateDepartment } from "./service.ts";
import { CreateDepartmentInput, ListDepartmentsInput, UpdateDepartmentInput } from "./validation.ts";

const departmentRef = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    code: { type: "string" },
    isActive: { type: "boolean" },
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

      validate("json", UpdateDepartmentInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(c, await updateDepartment(ctx.db, c.req.param("id"), input, actor));
      },
    );
}
