import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import type { AppVariables } from "../../http/app.ts";
import { ok, parseInput } from "../../http/errors.ts";
import { requirePermission } from "../identity/policy.ts";
import { CreateRoleInput, SetRolePermissionsInput, UpdateRoleInput } from "./schema.ts";
import { createRole, deleteRole, listRoles, permissionsForRole, setRolePermissions, updateRole } from "./service.ts";
import { allPermissions, statements, systemRoles } from "./statements.ts";

/**
 * Katalog + pengelolaan RBAC. Role sistem boleh dibaca & izinnya diubah, tapi tidak
 * dihapus: `statements.ts` adalah sumber kebenarannya, dan seed akan mengembalikannya.
 */
export function rbacRoutes(ctx: AppContext, organizationId: string): Hono<{ Variables: AppVariables }> {
  const actorOf = (actor: { userId: string; traceId: string; label: string }) => ({
    userId: actor.userId,
    traceId: actor.traceId,
    label: actor.label,
  });

  return (
    new Hono<{ Variables: AppVariables }>()
      .get("/", async (c) => {
        const actor = await requirePermission(c, ctx, "role.read");
        const orgId = actor.organizationId ?? organizationId;
        const items = await Promise.all(
          (await listRoles(ctx.db, orgId)).map(async (role) => ({
            ...role,
            permissions: await permissionsForRole(ctx.db, role.id),
          })),
        );
        return ok(c, { items, total: items.length });
      })
      .post("/", async (c) => {
        const actor = await requirePermission(c, ctx, "role.create");
        const input = parseInput(CreateRoleInput, await c.req.json());
        return ok(c, await createRole(ctx.db, actor.organizationId ?? organizationId, input, actorOf(actor)));
      })
      .patch("/:id", async (c) => {
        const actor = await requirePermission(c, ctx, "role.update");
        const input = parseInput(UpdateRoleInput, await c.req.json());
        return ok(
          c,
          await updateRole(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), input, actorOf(actor)),
        );
      })
      .delete("/:id", async (c) => {
        const actor = await requirePermission(c, ctx, "role.delete");
        return ok(
          c,
          await deleteRole(ctx.db, actor.organizationId ?? organizationId, c.req.param("id"), actorOf(actor)),
        );
      })
      .put("/:id/permissions", async (c) => {
        const actor = await requirePermission(c, ctx, "role.update");
        const input = parseInput(SetRolePermissionsInput, await c.req.json());
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
      })
      /**
       * Katalog statemen apa adanya dari kode. Dipakai UI untuk membangun layar izin
       * tanpa menyalin daftarnya — daftar yang disalin pasti akan basi.
       */
      .get("/statements", async (c) => {
        await requirePermission(c, ctx, "role.read");
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
      })
  );
}
