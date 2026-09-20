import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import type { AppVariables } from "../../http/app.ts";
import { ApiError, ok, parseInput } from "../../http/errors.ts";
import { requirePermission } from "../identity/policy.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import { CreateDepartmentInput, ListDepartmentsInput, UpdateDepartmentInput } from "./schema.ts";
import { createDepartment, findDepartment, listDepartments, updateDepartment } from "./service.ts";

/**
 * Route tipis: validasi → policy → service → envelope (PRD §6). Tidak ada business logic
 * di sini. Organization berasal dari ACTOR (session), bukan dari input klien.
 */
export function departmentRoutes(ctx: AppContext, fallbackOrganizationId: string): Hono<{ Variables: AppVariables }> {
  return new Hono<{ Variables: AppVariables }>()
    .get("/", async (c) => {
      const actor = await requirePermission(c, ctx, ACTION_PERMISSION.list);
      const input = parseInput(ListDepartmentsInput, c.req.query());
      const { items, total } = await listDepartments(ctx.db, actor.organizationId ?? fallbackOrganizationId, input);
      return ok(c, { items, total, limit: input.limit, offset: input.offset });
    })
    .get("/:id", async (c) => {
      const actor = await requirePermission(c, ctx, ACTION_PERMISSION.read);
      const department = await findDepartment(
        ctx.db,
        actor.organizationId ?? fallbackOrganizationId,
        c.req.param("id"),
      );
      // Tidak ada = 404. 403 hanya untuk yang gagal authorization (PRD §12).
      if (!department) throw ApiError.notFound("Department not found");
      return ok(c, department);
    })
    .post("/", async (c) => {
      const actor = await requirePermission(c, ctx, ACTION_PERMISSION.create);
      const input = parseInput(CreateDepartmentInput, await c.req.json());
      return ok(c, await createDepartment(ctx.db, actor.organizationId ?? fallbackOrganizationId, input));
    })
    .patch("/:id", async (c) => {
      const actor = await requirePermission(c, ctx, ACTION_PERMISSION.update);
      const input = parseInput(UpdateDepartmentInput, await c.req.json());
      return ok(
        c,
        await updateDepartment(ctx.db, actor.organizationId ?? fallbackOrganizationId, c.req.param("id"), input),
      );
    });
}
