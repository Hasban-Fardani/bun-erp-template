import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { authorize } from "../../http/helpers/authorize.ts";
import { ApiError, ok } from "../../http/helpers/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/helpers/list-query.ts";
import { idParam, idRoleKeyParam } from "../../http/helpers/params.ts";
import { validate } from "../../http/helpers/validate.ts";
import { ACTION_PERMISSION } from "./policy.ts";
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
export function identityRoutes(ctx: AppContext) {
  return factory
    .createApp()
    .get(
      "/",
      authorize(ctx, ACTION_PERMISSION.list),
      doc({
        tag: "users",
        permission: ACTION_PERMISSION.list,
        summary: "Daftar pengguna",
        query: ListUsersInput,
        data: listData,
      }),

      validate("query", ListUsersInput),
      async (c) => {
        const input = c.req.valid("query");
        const { items, total } = await listUsers(ctx.db, input);
        return ok(c, { items, ...listMeta(input, total) });
      },
    )
    .get(
      "/:id",
      authorize(ctx, ACTION_PERMISSION.read),
      doc({ tag: "users", permission: ACTION_PERMISSION.read, summary: "Detail pengguna", data: userRef }),

      validate("param", idParam),
      async (c) => {
        const user = await findUser(ctx.db, c.req.param("id"));
        if (!user) throw ApiError.notFound("User not found");
        return ok(c, user);
      },
    )
    .post(
      "/",
      authorize(ctx, ACTION_PERMISSION.create),
      doc({
        tag: "users",
        permission: ACTION_PERMISSION.create,
        summary: "Buat pengguna + sandi awal (admin invite tanpa server e-mail)",
        body: CreateUserInput,
        data: userRef,
      }),

      validate("json", CreateUserInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(c, await createUser(ctx.db, input, actorOf(actor)));
      },
    )
    .delete(
      "/:id",
      authorize(ctx, ACTION_PERMISSION.delete),
      doc({
        tag: "users",
        permission: ACTION_PERMISSION.delete,
        summary: "Hapus pengguna (sesi & kredensial ikut; audit tetap)",
        data: { type: "object", properties: { id: { type: "string" } } },
      }),

      validate("param", idParam),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await deleteUser(ctx.db, c.req.param("id"), actorOf(actor)));
      },
    )
    .patch(
      "/:id",
      authorize(ctx, ACTION_PERMISSION.update),
      doc({
        tag: "users",
        permission: ACTION_PERMISSION.update,
        summary: "Ubah profil pengguna",
        body: UpdateUserInput,
        data: userRef,
      }),

      validate("param", idParam),
      validate("json", UpdateUserInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(c, await updateUser(ctx.db, c.req.param("id"), input, actorOf(actor)));
      },
    )
    .post(
      "/:id/roles",
      authorize(ctx, ACTION_PERMISSION.assignRole),
      doc({
        tag: "users",
        permission: ACTION_PERMISSION.assignRole,
        summary: "Tugaskan role ke pengguna",
        body: AssignRoleInput,
        data: userRef,
      }),

      validate("param", idParam),
      validate("json", AssignRoleInput),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(c, await assignUserRole(ctx.db, c.req.param("id"), input, actorOf(actor)));
      },
    )
    .put(
      "/:id/roles",
      authorize(ctx, ACTION_PERMISSION.replaceRoles),
      doc({
        tag: "users",
        permission: ACTION_PERMISSION.replaceRoles,
        summary: "Ganti seluruh peran pengguna",
        body: ReplaceRolesInput,
        data: userRef,
      }),
      validate("param", idParam),
      validate("json", ReplaceRolesInput),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await replaceUserRoles(ctx.db, c.req.param("id"), c.req.valid("json").roleKeys, actorOf(actor)));
      },
    )
    .delete(
      "/:id/roles/:roleKey",
      authorize(ctx, ACTION_PERMISSION.revokeRole),
      doc({
        tag: "users",
        permission: ACTION_PERMISSION.revokeRole,
        summary: "Cabut role dari pengguna",
        data: userRef,
      }),

      validate("param", idRoleKeyParam),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await revokeUserRole(ctx.db, c.req.param("id"), c.req.param("roleKey"), actorOf(actor)));
      },
    );
}
