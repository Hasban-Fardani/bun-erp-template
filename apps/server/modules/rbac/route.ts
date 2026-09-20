import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import type { AppVariables } from "../../http/app.ts";
import { ok } from "../../http/errors.ts";
import { requirePermission } from "../identity/policy.ts";
import { listRoles } from "./service.ts";
import { allPermissions, statements, systemRoles } from "./statements.ts";

/**
 * Katalog RBAC. Read-only: role sistem berasal dari kode, dan role buatan admin
 * (Phase 3) akan ditambahkan bersama UI-nya — bukan lewat route yang belum ada.
 */
export function rbacRoutes(ctx: AppContext, organizationId: string): Hono<{ Variables: AppVariables }> {
  return (
    new Hono<{ Variables: AppVariables }>()
      .get("/", async (c) => {
        const actor = await requirePermission(c, ctx, "role.read");
        const items = await listRoles(ctx.db, actor.organizationId ?? organizationId);
        return ok(c, { items, total: items.length });
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
