import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { authorize } from "../../http/helpers/authorize.ts";
import { ok } from "../../http/helpers/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/helpers/list-query.ts";
import { validate } from "../../http/helpers/validate.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import { listAuditLogs } from "./service.ts";
import { ListAuditInput } from "./validation.ts";

/** Audit is read-only over HTTP — its single writer is recordAudit inside the service transaction. */
export function auditRoutes(ctx: AppContext) {
  return factory.createApp().get(
    "/",
    authorize(ctx, ACTION_PERMISSION.list),
    doc({
      tag: "audit",
      permission: ACTION_PERMISSION.list,
      summary: "Jejak audit (append-only)",
      query: ListAuditInput,
      data: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/AuditLog" } },
          ...listMetaSchemaProperties,
        },
      },
    }),

    validate("query", ListAuditInput),
    async (c) => {
      const input = c.req.valid("query");
      const { items, total } = await listAuditLogs(ctx.db, input);
      return ok(c, { items, ...listMeta(input, total) });
    },
  );
}
