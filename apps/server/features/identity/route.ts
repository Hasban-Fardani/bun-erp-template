import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import { doc } from "../../http/api-docs.ts";
import { authorize } from "../../http/authorize.ts";
import { ApiError, ok } from "../../http/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/list-query.ts";
import type { AppVariables } from "../../http/types.ts";
import { validate } from "../../http/validate.ts";
import {
  assignUserRole,
  createUser,
  deleteUser,
  findUser,
  listUsers,
  replaceUserRoles,
  revokeUserRole,
  updateUser,
} from "./service.ts";
import { AssignRoleInput, CreateUserInput, ListUsersInput, ReplaceRolesInput, UpdateUserInput } from "./validation.ts";

const userRef = { $ref: "#/components/schemas/PublicUser" } as const;

const listData = {
  type: "object",
  properties: { items: { type: "array", items: userRef }, ...listMetaSchemaProperties },
};

const actorOf = (actor: { userId: string; traceId: string; label: string }) => ({
  userId: actor.userId,
  traceId: actor.traceId,
  label: actor.label,
});

/** User administration (needs RBAC). Sign-up/sign-in belongs to the Better Auth handlers. */
export function identityRoutes(ctx: AppContext, organizationId: string) {
  return new Hono<{ Variables: AppVariables }>()
    .get(
      "/",
      authorize(ctx, "user.read"),
      doc({
        tag: "users",
        permission: "user.read",
        summary: "Daftar pengguna organisasi",
        query: ListUsersInput,
        data: listData,
      }),

      validate("query", ListUsersInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("query");
        const { items, total } = await listUsers(ctx.db, actor.organizationId ?? organizationId, input);
        return ok(c, { items, ...listMeta(input, total) });
      },
    )
    .get(
      "/:id",
      authorize(ctx, "user.read"),
      doc({ tag: "users", permission: "user.read", summary: "Detail pengguna", data: userRef }),

      async (c) => {
        const actor = c.get("actor");
        const user = await findUser(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"));
        if (!user) throw ApiError.notFound("User not found");
        return ok(c, user);
      },
    )
    .post(
      "/",
      authorize(ctx, "user.create"),
      doc({
        tag: "users",
        permission: "user.create",
        summary: "Buat pengguna + sandi awal (admin invite tanpa server e-mail)",
        body: CreateUserInput,
        data: userRef,
      }),

      validate("json", CreateUserInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(c, await createUser(ctx.db, actor.organizationId ?? organizationId, input, actorOf(actor)));
      },
    )
    .delete(
      "/:id",
      authorize(ctx, "user.delete"),
      doc({
        tag: "users",
        permission: "user.delete",
        summary: "Hapus pengguna (sesi & kredensial ikut; audit tetap)",
        data: { type: "object", properties: { id: { type: "string" } } },
      }),

      async (c) => {
        const actor = c.get("actor");
        return ok(
          c,
          await deleteUser(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), actorOf(actor)),
        );
      },
    )
    .patch(
      "/:id",
      authorize(ctx, "user.update"),
      doc({
        tag: "users",
        permission: "user.update",
        summary: "Ubah profil pengguna",
        body: UpdateUserInput,
        data: userRef,
      }),

      validate("json", UpdateUserInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(
          c,
          await updateUser(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), input, actorOf(actor)),
        );
      },
    )
    .post(
      "/:id/roles",
      authorize(ctx, "role.assign"),
      doc({
        tag: "users",
        permission: "role.assign",
        summary: "Tugaskan role ke pengguna",
        body: AssignRoleInput,
        data: userRef,
      }),

      validate("json", AssignRoleInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
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
    .put(
      "/:id/roles",
      authorize(ctx, "role.assign"),
      doc({
        tag: "users",
        permission: "role.assign",
        summary: "Ganti seluruh peran organisasi pengguna",
        body: ReplaceRolesInput,
        data: userRef,
      }),
      validate("json", ReplaceRolesInput),
      async (c) => {
        const actor = c.get("actor");
        return ok(
          c,
          await replaceUserRoles(
            ctx.db,
            actor.organizationId ?? organizationId,
            c.req.param("id"),
            c.req.valid("json").roleKeys,
            actorOf(actor),
          ),
        );
      },
    )
    .delete(
      "/:id/roles/:roleKey",
      authorize(ctx, "role.assign"),
      doc({
        tag: "users",
        permission: "role.assign",
        summary: "Cabut role dari pengguna",
        data: userRef,
      }),

      async (c) => {
        const actor = c.get("actor");
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
