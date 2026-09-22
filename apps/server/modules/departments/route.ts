import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import { doc } from "../../http/api-docs.ts";
import type { AppVariables } from "../../http/app.ts";
import { ApiError, ok, parseInput } from "../../http/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/list-query.ts";
import { requirePermission } from "../identity/policy.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import { CreateDepartmentInput, ListDepartmentsInput, UpdateDepartmentInput } from "./schema.ts";
import { createDepartment, findDepartment, listDepartments, updateDepartment } from "./service.ts";

const departmentRef = { $ref: "#/components/schemas/Department" } as const;

const listData = {
  type: "object",
  properties: { items: { type: "array", items: departmentRef }, ...listMetaSchemaProperties },
};

/**
 * Thin route: validation → policy → service → envelope (PRD §6). No business logic
 * here. Organization comes from the ACTOR (session), not from client input.
 */
export function departmentRoutes(ctx: AppContext, fallbackOrganizationId: string): Hono<{ Variables: AppVariables }> {
  return new Hono<{ Variables: AppVariables }>()
    .get(
      "/",
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.list,
        summary: "Daftar departemen",
        query: ListDepartmentsInput,
        data: listData,
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, ACTION_PERMISSION.list);
        const input = parseInput(ListDepartmentsInput, c.req.query());
        const { items, total } = await listDepartments(ctx.db, actor.organizationId ?? fallbackOrganizationId, input);
        return ok(c, { items, ...listMeta(input, total) });
      },
    )
    .get(
      "/:id",
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.read,
        summary: "Detail departemen",
        data: departmentRef,
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, ACTION_PERMISSION.read);
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
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.create,
        summary: "Buat departemen",
        body: CreateDepartmentInput,
        data: departmentRef,
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, ACTION_PERMISSION.create);
        const input = parseInput(CreateDepartmentInput, await c.req.json());
        return ok(c, await createDepartment(ctx.db, actor.organizationId ?? fallbackOrganizationId, input));
      },
    )
    .patch(
      "/:id",
      doc({
        tag: "departments",
        permission: ACTION_PERMISSION.update,
        summary: "Ubah departemen",
        body: UpdateDepartmentInput,
        data: departmentRef,
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, ACTION_PERMISSION.update);
        const input = parseInput(UpdateDepartmentInput, await c.req.json());
        return ok(
          c,
          await updateDepartment(ctx.db, actor.organizationId ?? fallbackOrganizationId, c.req.param("id"), input),
        );
      },
    );
}
