import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import { doc } from "../../http/api-docs.ts";
import { authorize } from "../../http/authorize.ts";
import { ApiError, ok } from "../../http/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/list-query.ts";
import type { AppVariables } from "../../http/types.ts";
import { validate } from "../../http/validate.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import { createDepartment, findDepartment, listDepartments, updateDepartment } from "./service.ts";
import { CreateDepartmentInput, ListDepartmentsInput, UpdateDepartmentInput } from "./validation.ts";

const departmentRef = { $ref: "#/components/schemas/Department" } as const;

const listData = {
  type: "object",
  properties: { items: { type: "array", items: departmentRef }, ...listMetaSchemaProperties },
};

/**
 * Thin route: validation → policy → service → envelope (PRD §6). No business logic
 * here. Organization comes from the ACTOR (session), not from client input.
 */
export function departmentRoutes(ctx: AppContext, fallbackOrganizationId: string) {
  return new Hono<{ Variables: AppVariables }>()
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
        const actor = c.get("actor");
        const input = c.req.valid("query");
        const { items, total } = await listDepartments(ctx.db, actor.organizationId ?? fallbackOrganizationId, input);
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
        const actor = c.get("actor");
        const department = await findDepartment(
          ctx.db,
          actor.organizationId ?? fallbackOrganizationId,
          c.req.param("id"),
        );
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
        return ok(c, await createDepartment(ctx.db, actor.organizationId ?? fallbackOrganizationId, input, actor));
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
        return ok(
          c,
          await updateDepartment(
            ctx.db,
            actor.organizationId ?? fallbackOrganizationId,
            c.req.param("id"),
            input,
            actor,
          ),
        );
      },
    );
}
