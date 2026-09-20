import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import type { AppVariables } from "../../http/app.ts";
import { ApiError, ok, parseInput } from "../../http/errors.ts";
import { requirePermission } from "./policy.ts";
import { AssignRoleInput, ListUsersInput, UpdateUserInput } from "./schema.ts";
import { assignUserRole, findUser, listUsers, revokeUserRole, updateUser } from "./service.ts";

/** Administrasi user (butuh RBAC). Sign-up/sign-in milik handler Better Auth. */
export function identityRoutes(ctx: AppContext, organizationId: string): Hono<{ Variables: AppVariables }> {
  return new Hono<{ Variables: AppVariables }>()
    .get("/", async (c) => {
      const actor = await requirePermission(c, ctx, "user.read");
      const input = parseInput(ListUsersInput, c.req.query());
      const { items, total } = await listUsers(ctx.db, actor.organizationId ?? organizationId, input);
      return ok(c, { items, total, limit: input.limit, offset: input.offset });
    })
    .get("/:id", async (c) => {
      const actor = await requirePermission(c, ctx, "user.read");
      const user = await findUser(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"));
      if (!user) throw ApiError.notFound("User not found");
      return ok(c, user);
    })
    .patch("/:id", async (c) => {
      const actor = await requirePermission(c, ctx, "user.update");
      const input = parseInput(UpdateUserInput, await c.req.json());
      const updated = await updateUser(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), input, {
        userId: actor.userId,
        traceId: actor.traceId,
        label: actor.label,
      });
      return ok(c, updated);
    })
    .post("/:id/roles", async (c) => {
      const actor = await requirePermission(c, ctx, "role.assign");
      const input = parseInput(AssignRoleInput, await c.req.json());
      const updated = await assignUserRole(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), input, {
        userId: actor.userId,
        traceId: actor.traceId,
        label: actor.label,
      });
      return ok(c, updated);
    })
    .delete("/:id/roles/:roleKey", async (c) => {
      const actor = await requirePermission(c, ctx, "role.assign");
      const updated = await revokeUserRole(
        ctx.db,
        actor.organizationId ?? organizationId,
        c.req.param("id"),
        c.req.param("roleKey"),
        { userId: actor.userId, traceId: actor.traceId, label: actor.label },
      );
      return ok(c, updated);
    });
}
