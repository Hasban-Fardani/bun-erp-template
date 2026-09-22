import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import { doc } from "../../http/api-docs.ts";
import type { AppVariables } from "../../http/app.ts";
import { ApiError, ok, parseInput } from "../../http/errors.ts";
import { requirePermission } from "./policy.ts";
import { AssignRoleInput, CreateUserInput, ListUsersInput, listUsersSchema, UpdateUserInput } from "./schema.ts";
import { assignUserRole, createUser, deleteUser, findUser, listUsers, revokeUserRole, updateUser } from "./service.ts";

const userRef = { $ref: "#/components/schemas/PublicUser" } as const;

const listData = {
  type: "object",
  properties: {
    items: { type: "array", items: userRef },
    total: { type: "integer" },
    limit: { type: "integer" },
    offset: { type: "integer" },
  },
};

const actorOf = (actor: { userId: string; traceId: string; label: string }) => ({
  userId: actor.userId,
  traceId: actor.traceId,
  label: actor.label,
});

/** Administrasi user (butuh RBAC). Sign-up/sign-in milik handler Better Auth. */
export function identityRoutes(ctx: AppContext, organizationId: string): Hono<{ Variables: AppVariables }> {
  return new Hono<{ Variables: AppVariables }>()
    .get(
      "/",
      doc({
        tag: "users",
        permission: "user.read",
        summary: "Daftar pengguna organisasi",
        query: listUsersSchema,
        data: listData,
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, "user.read");
        const input = parseInput(ListUsersInput, c.req.query());
        const { items, total } = await listUsers(ctx.db, actor.organizationId ?? organizationId, input);
        return ok(c, { items, total, limit: input.limit, offset: input.offset });
      },
    )
    .get(
      "/:id",
      doc({ tag: "users", permission: "user.read", summary: "Detail pengguna", data: userRef }),
      async (c) => {
        const actor = await requirePermission(c, ctx, "user.read");
        const user = await findUser(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"));
        if (!user) throw ApiError.notFound("User not found");
        return ok(c, user);
      },
    )
    .post(
      "/",
      doc({
        tag: "users",
        permission: "user.create",
        summary: "Buat pengguna + sandi awal (admin invite tanpa server e-mail)",
        body: CreateUserInput,
        data: userRef,
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, "user.create");
        const input = parseInput(CreateUserInput, await c.req.json());
        return ok(c, await createUser(ctx.db, actor.organizationId ?? organizationId, input, actorOf(actor)));
      },
    )
    .delete(
      "/:id",
      doc({
        tag: "users",
        permission: "user.delete",
        summary: "Hapus pengguna (sesi & kredensial ikut; audit tetap)",
        data: { type: "object", properties: { id: { type: "string" } } },
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, "user.delete");
        return ok(
          c,
          await deleteUser(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), actorOf(actor)),
        );
      },
    )
    .patch(
      "/:id",
      doc({
        tag: "users",
        permission: "user.update",
        summary: "Ubah profil pengguna",
        body: UpdateUserInput,
        data: userRef,
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, "user.update");
        const input = parseInput(UpdateUserInput, await c.req.json());
        return ok(
          c,
          await updateUser(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), input, actorOf(actor)),
        );
      },
    )
    .post(
      "/:id/roles",
      doc({
        tag: "users",
        permission: "role.assign",
        summary: "Tugaskan role ke pengguna",
        body: AssignRoleInput,
        data: userRef,
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, "role.assign");
        const input = parseInput(AssignRoleInput, await c.req.json());
        return ok(
          c,
          await assignUserRole(
            ctx.db,
            actor.organizationId ?? organizationId,
            c.req.param("id"),
            input,
            actorOf(actor),
          ),
        );
      },
    )
    .delete(
      "/:id/roles/:roleKey",
      doc({
        tag: "users",
        permission: "role.assign",
        summary: "Cabut role dari pengguna",
        data: userRef,
      }),
      async (c) => {
        const actor = await requirePermission(c, ctx, "role.assign");
        return ok(
          c,
          await revokeUserRole(
            ctx.db,
            actor.organizationId ?? organizationId,
            c.req.param("id"),
            c.req.param("roleKey"),
            actorOf(actor),
          ),
        );
      },
    );
}
