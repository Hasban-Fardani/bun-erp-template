import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import type { AppVariables } from "../../http/app.ts";
import { ApiError, ok, parseInput } from "../../http/errors.ts";
import { authorizeDepartment } from "./policy.ts";
import { CreateDepartmentInput, ListDepartmentsInput, UpdateDepartmentInput } from "./schema.ts";
import { createDepartment, findDepartment, listDepartments, updateDepartment } from "./service.ts";

/**
 * Route tipis: validasi → policy → service → envelope. Tidak ada business logic di sini
 * (PRD §6 "Processor hanya memanggil module service dan tidak menyalin business logic").
 * Organization berasal dari context server, bukan dari input klien.
 */
export function departmentRoutes(ctx: AppContext, organizationId: string): Hono<{ Variables: AppVariables }> {
  return new Hono<{ Variables: AppVariables }>()
    .get("/", async (c) => {
      authorizeDepartment("view");
      const input = parseInput(ListDepartmentsInput, c.req.query());
      const { items, total } = await listDepartments(ctx.db, organizationId, input);
      return ok(c, { items, total, limit: input.limit, offset: input.offset });
    })
    .get("/:id", async (c) => {
      authorizeDepartment("view");
      const department = await findDepartment(ctx.db, organizationId, c.req.param("id"));
      // Tidak ada = 404. 403 hanya untuk yang gagal authorization (PRD §12).
      if (!department) throw ApiError.notFound("Department not found");
      return ok(c, department);
    })
    .post("/", async (c) => {
      authorizeDepartment("create");
      const input = parseInput(CreateDepartmentInput, await c.req.json());
      return ok(c, await createDepartment(ctx.db, organizationId, input));
    })
    .patch("/:id", async (c) => {
      authorizeDepartment("update");
      const input = parseInput(UpdateDepartmentInput, await c.req.json());
      return ok(c, await updateDepartment(ctx.db, organizationId, c.req.param("id"), input));
    });
}
