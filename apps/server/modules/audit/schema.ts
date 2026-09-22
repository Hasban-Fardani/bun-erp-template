import * as z from "zod";
import { listQueryParts } from "../../http/list-query.ts";

/** Audit log filters. The time range uses ISO strings so it stays URL-friendly. */
export const listAuditSchema = z.strictObject({
  ...listQueryParts({ sortable: ["createdAt", "event", "actorLabel"], defaultSort: "createdAt", defaultDir: "desc" }),
  event: z.string().trim().max(120).optional(),
  subjectType: z.string().trim().max(60).optional(),
  subjectId: z.string().trim().max(120).optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});

export const ListAuditInput = z.compile(listAuditSchema);

export type ListAuditInput = z.output<typeof ListAuditInput>;
