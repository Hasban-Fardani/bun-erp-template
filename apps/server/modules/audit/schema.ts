import * as z from "zod";

/** Filter log audit. Rentang waktu memakai ISO string supaya mudah dipakai dari URL. */
export const listAuditSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  event: z.string().trim().max(120).optional(),
  subjectType: z.string().trim().max(60).optional(),
  subjectId: z.string().trim().max(120).optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});

export const ListAuditInput = z.compile(listAuditSchema);

export type ListAuditInput = z.output<typeof ListAuditInput>;
