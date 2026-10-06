import * as z from "zod";
import { listQueryParts } from "../../http/helpers/list-query.ts";
import { MAX_IMPORT_ROWS } from "./service.ts";

/** The web parses the file; the server receives headers plus string rows and an optional mapping. */
export const importPayloadSchema = z.strictObject({
  resource: z.string().trim().min(1).max(64),
  headers: z.array(z.string().trim().min(1).max(200)).min(1).max(500),
  rows: z.array(z.array(z.string().max(10_000)).max(500)).max(MAX_IMPORT_ROWS),
  mapping: z.record(z.string().trim().min(1).max(200), z.string().trim().min(1).max(64)).optional(),
});

export const listImportsSchema = z.strictObject({
  ...listQueryParts({ sortable: ["createdAt"], defaultSort: "createdAt", defaultDir: "desc" }),
  search: z.string().trim().max(120).optional(),
});

/**
 * Export accepts the table's own query plus column selection. `sort` stays a free string because
 * the sortable columns belong to the resource, not to this generic endpoint.
 */
export const exportQuerySchema = z.strictObject({
  columns: z.string().trim().max(2000).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().trim().max(64).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().max(200).optional(),
});

export const ImportPayloadInput = z.compile(importPayloadSchema);
export const ListImportsInput = z.compile(listImportsSchema);
export const ExportQueryInput = z.compile(exportQuerySchema);

export type ImportPayloadInput = z.output<typeof ImportPayloadInput>;
export type ListImportsInput = z.output<typeof ListImportsInput>;
export type ExportQueryInput = z.output<typeof ExportQueryInput>;
