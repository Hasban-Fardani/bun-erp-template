import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import { doc } from "../../http/api-docs.ts";
import type { AppVariables } from "../../http/app.ts";
import { ok, parseInput } from "../../http/errors.ts";
import { requirePermission } from "../identity/policy.ts";
import { ListAuditInput } from "./schema.ts";
import { listAuditLogs } from "./service.ts";

/** Audit baca-saja via HTTP — satu penulisnya recordAudit di transaksi service. */
export function auditRoutes(ctx: AppContext, organizationId: string): Hono<{ Variables: AppVariables }> {
  return new Hono<{ Variables: AppVariables }>().get(
    "/",
    doc({
      tag: "audit",
      permission: "audit.read",
      summary: "Jejak audit (append-only)",
      query: ListAuditInput,
      data: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/AuditLog" } },
          total: { type: "integer" },
          limit: { type: "integer" },
          offset: { type: "integer" },
        },
      },
    }),
    async (c) => {
      const actor = await requirePermission(c, ctx, "audit.read");
      const input = parseInput(ListAuditInput, c.req.query());
      const { items, total } = await listAuditLogs(ctx.db, actor.organizationId ?? organizationId, input);
      return ok(c, { items, total, limit: input.limit, offset: input.offset });
    },
  );
}
