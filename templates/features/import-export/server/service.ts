import { sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { rowsOf } from "../../database/rows.ts";
import { ApiError, ErrorCode } from "../../http/helpers/errors.ts";
import { toOffset } from "../../http/helpers/list-query.ts";
import {
  cancelJobBatch,
  createJobBatch,
  getJobBatch,
  type JobBatchProgress,
  type JobBatchStatus,
  resumeJobBatch,
} from "../../infra/jobs/batch.ts";
import { recordAudit, snapshot } from "../audit/index.ts";
import type {
  ExportCell,
  ImportExportColumn,
  ImportExportListQuery,
  ImportExportResource,
  ImportRowIssue,
  ImportRowValues,
  ImportSource,
} from "./registry.ts";

/** The batch handler name the feature registers; also the filter that marks import batches. */
export const IMPORT_BATCH_NAME = "import-export.rows";

export const MAX_IMPORT_ROWS = 50_000;
export const MAX_REPORT_ERRORS = 200;
const MAX_EXPORT_ROWS = 100_000;
const EXPORT_PAGE_SIZE = 500;

export type ImportDryRunError = { row: number; column: string | null; code: string; message: string };
export type ImportDryRunRow = { row: number; values: ImportRowValues };

export type ImportDryRunReport = {
  resource: string;
  label: string;
  headers: readonly string[];
  mapping: Readonly<Record<string, string>>;
  total: number;
  valid: number;
  invalid: number;
  errors: readonly ImportDryRunError[];
  /** True when more errors exist than the report keeps. */
  truncated: boolean;
  /** First mapped rows, so the wizard can show what confirm will import. */
  preview: readonly ImportDryRunRow[];
};

export type ImportStartResult = { batchId: string; jobId: string; report: ImportDryRunReport };

export type ImportBatchSummary = {
  id: string;
  status: JobBatchStatus;
  resource: string;
  label: string;
  total: number;
  processed: number;
  failed: number;
  pending: number;
  createdAt: Date;
  finishedAt: Date | null;
};

export type ExportData = {
  resource: string;
  label: string;
  columns: readonly ImportExportColumn[];
  /** Matrix aligned to `columns`; the browser turns it into CSV or XLSX. */
  rows: readonly (readonly ExportCell[])[];
  total: number;
};

/**
 * Maps source headers to resource columns, validates every row and returns both the report and the
 * rows a confirm would import. Confirm runs the same function again, so the dry run is never the
 * only validation.
 */
export function buildDryRun(
  resource: ImportExportResource,
  source: ImportSource,
  mapping: Readonly<Record<string, string>>,
): { report: ImportDryRunReport; rows: ImportDryRunRow[] } {
  if (source.rows.length > MAX_IMPORT_ROWS) {
    throw new ApiError(ErrorCode.validationFailed, 422, `A single import supports at most ${MAX_IMPORT_ROWS} rows`, [
      { path: "rows", message: `too many rows (${source.rows.length})` },
    ]);
  }
  assertMapping(resource, source, mapping);

  const errors: ImportDryRunError[] = [];
  const rows: ImportDryRunRow[] = [];
  let truncated = false;
  source.rows.forEach((cells, index) => {
    const rowNumber = index + 2; // header is row 1; the operator counts spreadsheet rows
    const values = mappedValues(source.headers, cells, mapping);
    const issues = validateRow(resource, values);
    if (issues.length === 0) {
      rows.push({ row: rowNumber, values });
      return;
    }
    for (const issue of issues) {
      if (errors.length >= MAX_REPORT_ERRORS) {
        truncated = true;
        continue;
      }
      errors.push({ row: rowNumber, column: issue.column ?? null, code: issue.code, message: issue.message });
    }
  });

  const invalid = source.rows.length - rows.length;
  return {
    rows,
    report: {
      resource: resource.name,
      label: resource.label,
      headers: source.headers,
      mapping,
      total: source.rows.length,
      valid: rows.length,
      invalid,
      errors,
      truncated,
      preview: rows.slice(0, 5),
    },
  };
}

/** Header-name mapping: the wizard's default, and the report echoes it back for confirmation. */
export function autoMapping(resource: ImportExportResource, source: ImportSource): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const column of resource.columns) {
    const header = source.headers.find((entry) => entry.trim().toLowerCase() === column.header.toLowerCase());
    if (header) mapping[header] = column.key;
  }
  return mapping;
}

/** Creates the batch, its runner job and the audit entry in one transaction. */
export async function startImport(
  db: Database,
  input: {
    resource: ImportExportResource;
    source: ImportSource;
    mapping: Readonly<Record<string, string>>;
    actor: { userId: string | null; traceId: string; label?: string };
    idempotencyKey?: string;
  },
): Promise<ImportStartResult> {
  const { report, rows } = buildDryRun(input.resource, input.source, input.mapping);
  if (rows.length === 0) {
    throw new ApiError(ErrorCode.validationFailed, 422, "No valid rows to import", [
      { path: "rows", message: "every row failed validation" },
    ]);
  }
  return db.transaction(async (tx) => {
    const { batchId, jobId } = await createJobBatch(tx, {
      name: IMPORT_BATCH_NAME,
      items: rows.map((row) => ({
        key: String(row.row),
        payload: { resource: input.resource.name, values: row.values },
      })),
      metadata: {
        resource: input.resource.name,
        label: input.resource.label,
        actorId: input.actor.userId,
      },
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    });
    await recordAudit(tx, {
      actorId: input.actor.userId,
      actorLabel: input.actor.label ?? "",
      traceId: input.actor.traceId,
      event: "import-export.import_started",
      subjectType: "import-export",
      subjectId: batchId,
      after: snapshot("import-export", {
        id: batchId,
        resource: input.resource.name,
        total: report.total,
        valid: report.valid,
        invalid: report.invalid,
      }),
    });
    return { batchId, jobId, report };
  });
}

/** Progress for one import; a batch of another kind is not this feature's to expose. */
export async function getImportProgress(db: Database, batchId: string): Promise<JobBatchProgress | null> {
  const batch = await getJobBatch(db, batchId);
  return batch && batch.name === IMPORT_BATCH_NAME ? batch : null;
}

export async function cancelImport(db: Database, batchId: string): Promise<boolean> {
  const batch = await getJobBatch(db, batchId);
  if (!batch || batch.name !== IMPORT_BATCH_NAME) return false;
  return cancelJobBatch(db, batchId);
}

export async function resumeImport(db: Database, batchId: string): Promise<boolean> {
  const batch = await getJobBatch(db, batchId);
  if (!batch || batch.name !== IMPORT_BATCH_NAME) return false;
  return resumeJobBatch(db, batchId);
}

export async function listImports(
  db: Database,
  input: ImportExportListQuery,
): Promise<{ items: ImportBatchSummary[]; total: number }> {
  const search = input.search?.trim() ? `%${input.search.trim()}%` : null;
  const where = sql`batch_name = ${IMPORT_BATCH_NAME} and (${search}::text is null or metadata->>'label' ilike ${search})`;
  const [items, count] = await Promise.all([
    db.execute(sql`
      select id, status, total, processed, failed,
        coalesce(metadata->>'resource', '') as resource, coalesce(metadata->>'label', '') as label,
        created_at as "createdAt", finished_at as "finishedAt"
      from job_batches
      where ${where}
      order by created_at desc
      limit ${input.perPage} offset ${toOffset(input).offset}
    `),
    db.execute(sql`select count(*)::int as total from job_batches where ${where}`),
  ]);
  return {
    items: rowsOf<ImportBatchSummary>(items).map((row) => ({
      ...row,
      pending: Math.max(0, row.total - row.processed),
    })),
    total: rowsOf<{ total: number }>(count)[0]?.total ?? 0,
  };
}

/**
 * Export data for the browser to write: the same list contract the resource's table calls, with
 * sort/search honoured and only the selected columns returned.
 */
export async function selectExportData(
  db: Database,
  input: { resource: ImportExportResource; columns?: readonly string[]; query: ImportExportListQuery },
): Promise<ExportData> {
  const { resource } = input;
  if (!resource.list) {
    throw new ApiError(ErrorCode.validationFailed, 422, `Resource ${resource.name} cannot be exported`, [
      { path: "resource", message: "no list contract" },
    ]);
  }
  const columns = selectColumns(resource, input.columns);
  const records = await collectRows(db, resource, input.query);
  return {
    resource: resource.name,
    label: resource.label,
    columns,
    rows: records.map((record) => columns.map((column) => toCell(record[column.key]))),
    total: records.length,
  };
}

function assertMapping(
  resource: ImportExportResource,
  source: ImportSource,
  mapping: Readonly<Record<string, string>>,
): void {
  const fields: { path: string; message: string }[] = [];
  const mappedColumns = new Set<string>();
  for (const [header, key] of Object.entries(mapping)) {
    if (!source.headers.includes(header)) fields.push({ path: `mapping.${header}`, message: "header not in the file" });
    if (!resource.columns.some((column) => column.key === key)) {
      fields.push({ path: `mapping.${header}`, message: `unknown column ${key}` });
    }
    if (mappedColumns.has(key)) fields.push({ path: `mapping.${header}`, message: `column ${key} is mapped twice` });
    mappedColumns.add(key);
  }
  for (const column of resource.columns) {
    if (column.required && !mappedColumns.has(column.key)) {
      fields.push({ path: `mapping.${column.key}`, message: `${column.header} must be mapped` });
    }
  }
  if (fields.length > 0) {
    throw new ApiError(ErrorCode.validationFailed, 422, "Column mapping is incomplete", fields);
  }
}

function mappedValues(
  headers: readonly string[],
  cells: readonly string[],
  mapping: Readonly<Record<string, string>>,
): ImportRowValues {
  const values: Record<string, string> = {};
  for (const [header, key] of Object.entries(mapping)) {
    const index = headers.indexOf(header);
    values[key] = index >= 0 ? (cells[index] ?? "").trim() : "";
  }
  return values;
}

function validateRow(resource: ImportExportResource, values: ImportRowValues): readonly ImportRowIssue[] {
  const issues: ImportRowIssue[] = [];
  for (const column of resource.columns) {
    if (column.required && (values[column.key] ?? "").length === 0) {
      issues.push({ column: column.key, code: "REQUIRED", message: `${column.header} is required` });
    }
  }
  if (resource.validateRow) issues.push(...resource.validateRow(values));
  return issues;
}

function selectColumns(
  resource: ImportExportResource,
  requested: readonly string[] | undefined,
): readonly ImportExportColumn[] {
  if (!requested || requested.length === 0) return resource.columns;
  const selected: ImportExportColumn[] = [];
  for (const key of requested) {
    const column = resource.columns.find((entry) => entry.key === key);
    if (!column) {
      throw new ApiError(ErrorCode.validationFailed, 422, `Unknown export column: ${key}`, [
        { path: "columns", message: `unknown column ${key}` },
      ]);
    }
    selected.push(column);
  }
  return selected;
}

async function collectRows(
  db: Database,
  resource: ImportExportResource,
  query: ImportExportListQuery,
): Promise<readonly Record<string, unknown>[]> {
  const list = resource.list;
  if (!list) return [];
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; ; page += 1) {
    const result = await list(db, { ...query, page, perPage: EXPORT_PAGE_SIZE });
    rows.push(...result.items);
    if (result.items.length === 0 || rows.length >= result.total) break;
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new ApiError(ErrorCode.validationFailed, 422, `Export supports at most ${MAX_EXPORT_ROWS} rows`, [
        { path: "columns", message: "narrow the filter before exporting" },
      ]);
    }
  }
  return rows;
}

function toCell(value: unknown): ExportCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}
