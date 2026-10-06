import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { authorize } from "../../http/helpers/authorize.ts";
import { ok } from "../../http/helpers/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/helpers/list-query.ts";
import { validate } from "../../http/helpers/validate.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import { createRole, deleteRole, listRoles, permissionsForRole, setRolePermissions, updateRole } from "./service.ts";
import { allPermissions, statements, systemRoles } from "./statements.ts";
import { CreateRoleInput, ListRolesInput, SetRolePermissionsInput, UpdateRoleInput } from "./validation.ts";

const roleRef = { $ref: "#/components/schemas/Role" } as const;
const idRef = { type: "object", properties: { id: { type: "string" } } } as const;

/**
 * Catalogue + RBAC management. System roles may be read and have their permissions changed,
 * but not deleted: `statements.ts` is the source of truth, and the seed will bring them back.
 */
export function rbacRoutes(ctx: AppContext) {
  const actorOf = (actor: { userId: string; traceId: string; label: string }) => ({
    userId: actor.userId,
    traceId: actor.traceId,
    label: actor.label,
  });

  return (
    factory
      .createApp()
      .get(
        "/",
        authorize(ctx, ACTION_PERMISSION.list),
        doc({
          tag: "roles",
          permission: ACTION_PERMISSION.list,
          summary: "Daftar role beserta izinnya",
          data: {
            type: "object",
            properties: { items: { type: "array", items: roleRef }, ...listMetaSchemaProperties },
          },
        }),

        validate("query", ListRolesInput),
        async (c) => {
          const input = c.req.valid("query");
          const { items, total } = await listRoles(ctx.db, input);
          const withPermissions = await Promise.all(
            items.map(async (role) => ({ ...role, permissions: await permissionsForRole(ctx.db, role.id) })),
          );
          return ok(c, { items: withPermissions, ...listMeta(input, total) });
        },
      )
      .post(
        "/",
        authorize(ctx, ACTION_PERMISSION.create),
        doc({
          tag: "roles",
          permission: ACTION_PERMISSION.create,
          summary: "Buat role kustom",
          body: CreateRoleInput,
          data: roleRef,
        }),

        validate("json", CreateRoleInput),
        async (c) => {
          const actor = c.get("actor");
          const input = c.req.valid("json");
          return ok(c, await createRole(ctx.db, input, actorOf(actor)));
        },
      )
      .patch(
        "/:id",
        authorize(ctx, ACTION_PERMISSION.update),
        doc({
          tag: "roles",
          permission: ACTION_PERMISSION.update,
          summary: "Ubah nama/deskripsi role",
          body: UpdateRoleInput,
          data: roleRef,
        }),

        validate("json", UpdateRoleInput),
        async (c) => {
          const actor = c.get("actor");
          const input = c.req.valid("json");
          return ok(c, await updateRole(ctx.db, c.req.param("id"), input, actorOf(actor)));
        },
      )
      .delete(
        "/:id",
        authorize(ctx, ACTION_PERMISSION.delete),
        doc({
          tag: "roles",
          permission: ACTION_PERMISSION.delete,
          summary: "Hapus role kustom (ditolak bila sistem atau masih dipakai)",
          data: idRef,
        }),

        async (c) => {
          const actor = c.get("actor");
          return ok(c, await deleteRole(ctx.db, c.req.param("id"), actorOf(actor)));
        },
      )
      .put(
        "/:id/permissions",
        authorize(ctx, ACTION_PERMISSION.setPermissions),
        doc({
          tag: "roles",
          permission: ACTION_PERMISSION.setPermissions,
          summary: "Timpa seluruh izin role dengan daftar yang dikirim",
          body: SetRolePermissionsInput,
          data: {
            type: "object",
            properties: { id: { type: "string" }, permissions: { type: "array", items: { type: "string" } } },
          },
        }),

        validate("json", SetRolePermissionsInput),
        async (c) => {
          const actor = c.get("actor");
          const input = c.req.valid("json");
          return ok(c, await setRolePermissions(ctx.db, c.req.param("id"), input.permissions, actorOf(actor)));
        },
      )
      /**
       * The statement catalogue verbatim from code. The UI builds the permission screen from it
       * without copying the list — a copied list is guaranteed to go stale.
       */
      .get(
        "/statements",
        authorize(ctx, ACTION_PERMISSION.statements),
        doc({
          tag: "roles",
          permission: ACTION_PERMISSION.statements,
          summary: "Katalog izin & role sistem (sumber = kode)",
          data: { type: "object" },
        }),

        async (c) => {
          c.get("actor");
          return ok(c, {
            statements,
            permissions: allPermissions,
            systemRoles: Object.entries(systemRoles).map(([key, def]) => ({
              key,
              name: def.name,
              description: def.description,
              permissions: def.permissions,
            })),
          });
        },
      )
  );
}
