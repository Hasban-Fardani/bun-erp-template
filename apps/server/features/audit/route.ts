import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import { doc } from "../../http/api-docs.ts";
import { authorize } from "../../http/authorize.ts";
import { ok } from "../../http/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/list-query.ts";
import type { AppVariables } from "../../http/types.ts";
import { validate } from "../../http/validate.ts";
import { listAuditLogs } from "./service.ts";
import { ListAuditInput } from "./validation.ts";

/** Audit is read-only over HTTP — its single writer is recordAudit inside the service transaction. */
export function auditRoutes(ctx: AppContext, organizationId: string) {
  return new Hono<{ Variables: AppVariables }>().get(
    "/",
    authorize(ctx, "audit.read"),
    doc({
      tag: "audit",
      permission: "audit.read",
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
      const actor = c.get("actor");
      const input = c.req.valid("query");
      const { items, total } = await listAuditLogs(ctx.db, actor.organizationId ?? organizationId, input);
      return ok(c, { items, ...listMeta(input, total) });
    },
  );
}
