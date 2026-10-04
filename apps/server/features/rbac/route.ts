import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import { doc } from "../../http/api-docs.ts";
import { authorize } from "../../http/authorize.ts";
import { ok } from "../../http/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/list-query.ts";
import type { AppVariables } from "../../http/types.ts";
import { validate } from "../../http/validate.ts";
import { createRole, deleteRole, listRoles, permissionsForRole, setRolePermissions, updateRole } from "./service.ts";
import { allPermissions, statements, systemRoles } from "./statements.ts";
import { CreateRoleInput, ListRolesInput, SetRolePermissionsInput, UpdateRoleInput } from "./validation.ts";

const roleRef = { $ref: "#/components/schemas/Role" } as const;
const idRef = { type: "object", properties: { id: { type: "string" } } } as const;

/**
 * Catalogue + RBAC management. System roles may be read and have their permissions changed,
 * but not deleted: `statements.ts` is the source of truth, and the seed will bring them back.
 */
export function rbacRoutes(ctx: AppContext, organizationId: string) {
  const actorOf = (actor: { userId: string; traceId: string; label: string }) => ({
    userId: actor.userId,
    traceId: actor.traceId,
    label: actor.label,
  });

  return (
    new Hono<{ Variables: AppVariables }>()
      .get(
        "/",
        authorize(ctx, "role.read"),
        doc({
          tag: "roles",
          permission: "role.read",
          summary: "Daftar role organisasi beserta izinnya",
          data: {
            type: "object",
            properties: { items: { type: "array", items: roleRef }, ...listMetaSchemaProperties },
          },
        }),

        validate("query", ListRolesInput),
        async (c) => {
          const actor = c.get("actor");
          const orgId = actor.organizationId ?? organizationId;
          const input = c.req.valid("query");
          const { items, total } = await listRoles(ctx.db, orgId, input);
          const withPermissions = await Promise.all(
            items.map(async (role) => ({ ...role, permissions: await permissionsForRole(ctx.db, role.id) })),
          );
          return ok(c, { items: withPermissions, ...listMeta(input, total) });
        },
      )
      .post(
        "/",
        authorize(ctx, "role.create"),
        doc({
          tag: "roles",
          permission: "role.create",
          summary: "Buat role kustom",
          body: CreateRoleInput,
          data: roleRef,
        }),

        validate("json", CreateRoleInput),
        async (c) => {
          const actor = c.get("actor");
          const input = c.req.valid("json");
          return ok(c, await createRole(ctx.db, actor.organizationId ?? organizationId, input, actorOf(actor)));
        },
      )
      .patch(
        "/:id",
        authorize(ctx, "role.update"),
        doc({
          tag: "roles",
          permission: "role.update",
          summary: "Ubah nama/deskripsi role",
          body: UpdateRoleInput,
          data: roleRef,
        }),

        validate("json", UpdateRoleInput),
        async (c) => {
          const actor = c.get("actor");
          const input = c.req.valid("json");
          return ok(
            c,
            await updateRole(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), input, actorOf(actor)),
          );
        },
      )
      .delete(
        "/:id",
        authorize(ctx, "role.delete"),
        doc({
          tag: "roles",
          permission: "role.delete",
          summary: "Hapus role kustom (ditolak bila sistem atau masih dipakai)",
          data: idRef,
        }),

        async (c) => {
          const actor = c.get("actor");
          return ok(
            c,
            await deleteRole(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), actorOf(actor)),
          );
        },
      )
      .put(
        "/:id/permissions",
        authorize(ctx, "role.update"),
        doc({
          tag: "roles",
          permission: "role.update",
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
          return ok(
            c,
            await setRolePermissions(
              ctx.db,
              actor.organizationId ?? organizationId,
              c.req.param("id"),
              input.permissions,
              actorOf(actor),
            ),
          );
        },
      )
      /**
       * The statement catalogue verbatim from code. The UI builds the permission screen from it
       * without copying the list — a copied list is guaranteed to go stale.
       */
      .get(
        "/statements",
        authorize(ctx, "role.read"),
        doc({
          tag: "roles",
          permission: "role.read",
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
