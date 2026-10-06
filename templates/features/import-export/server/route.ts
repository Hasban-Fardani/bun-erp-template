import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { authorize } from "../../http/helpers/authorize.ts";
import { ApiError, ErrorCode, ok } from "../../http/helpers/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/helpers/list-query.ts";
import { validate } from "../../http/helpers/validate.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import { importExportResources } from "./registry.ts";
import {
  autoMapping,
  buildDryRun,
  cancelImport,
  getImportProgress,
  listImports,
  resumeImport,
  selectExportData,
  startImport,
} from "./service.ts";
import { ExportQueryInput, ImportPayloadInput, ListImportsInput } from "./validation.ts";

const resourceRef = {
  type: "object",
  properties: {
    name: { type: "string" },
    label: { type: "string" },
    columns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          header: { type: "string" },
          required: { type: "boolean" },
          numFmt: { type: "string" },
        },
      },
    },
    canImport: { type: "boolean" },
    canExport: { type: "boolean" },
  },
} as const;

const reportRef = {
  type: "object",
  properties: {
    resource: { type: "string" },
    label: { type: "string" },
    headers: { type: "array", items: { type: "string" } },
    mapping: { type: "object", additionalProperties: { type: "string" } },
    total: { type: "integer" },
    valid: { type: "integer" },
    invalid: { type: "integer" },
    truncated: { type: "boolean" },
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          row: { type: "integer" },
          column: { type: "string" },
          code: { type: "string" },
          message: { type: "string" },
        },
      },
    },
    preview: { type: "array", items: { type: "object" } },
  },
} as const;

const batchRef = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    status: { type: "string" },
    total: { type: "integer" },
    processed: { type: "integer" },
    failed: { type: "integer" },
    pending: { type: "integer" },
    createdAt: { type: "string", format: "date-time" },
    finishedAt: { type: "string", format: "date-time" },
  },
} as const;

const importRef = {
  type: "object",
  properties: { batchId: { type: "string" }, jobId: { type: "string" }, report: reportRef },
} as const;

const importSummaryRef = {
  type: "object",
  properties: {
    id: { type: "string" },
    status: { type: "string" },
    resource: { type: "string" },
    label: { type: "string" },
    total: { type: "integer" },
    processed: { type: "integer" },
    failed: { type: "integer" },
    pending: { type: "integer" },
    createdAt: { type: "string", format: "date-time" },
    finishedAt: { type: "string", format: "date-time" },
  },
} as const;

const exportRef = {
  type: "object",
  properties: {
    resource: { type: "string" },
    label: { type: "string" },
    columns: { type: "array", items: resourceRef.properties.columns.items },
    rows: { type: "array", items: { type: "array", items: {} } },
    total: { type: "integer" },
  },
} as const;

/** Thin routes: authorization → validation → service → envelope. The pipeline lives in service.ts. */
export function importExportRoutes(ctx: AppContext) {
  return factory
    .createApp()
    .get(
      "/resources",
      authorize(ctx, ACTION_PERMISSION.list),
      doc({
        tag: "import-export",
        permission: ACTION_PERMISSION.list,
        summary: "Import and export resources",
        data: { type: "object", properties: { items: { type: "array", items: resourceRef } } },
      }),
      (c) =>
        ok(c, {
          items: importExportResources.list().map((resource) => ({
            name: resource.name,
            label: resource.label,
            columns: resource.columns,
            canImport: Boolean(resource.importRow),
            canExport: Boolean(resource.list),
          })),
        }),
    )
    .get(
      "/imports",
      authorize(ctx, ACTION_PERMISSION.list),
      doc({
        tag: "import-export",
        permission: ACTION_PERMISSION.list,
        summary: "Import history",
        query: ListImportsInput,
        data: {
          type: "object",
          properties: { items: { type: "array", items: importSummaryRef }, ...listMetaSchemaProperties },
        },
      }),
      validate("query", ListImportsInput),
      async (c) => {
        const input = c.req.valid("query");
        const { items, total } = await listImports(ctx.db, input);
        return ok(c, { items, ...listMeta(input, total) });
      },
    )
    .get(
      "/imports/:id",
      authorize(ctx, ACTION_PERMISSION.read),
      doc({
        tag: "import-export",
        permission: ACTION_PERMISSION.read,
        summary: "Import progress",
        data: batchRef,
      }),
      async (c) => {
        const batch = await getImportProgress(ctx.db, c.req.param("id"));
        if (!batch) throw ApiError.notFound("Import not found");
        return ok(c, batch);
      },
    )
    .post(
      "/imports/dry-run",
      authorize(ctx, ACTION_PERMISSION.dryRun),
      doc({
        tag: "import-export",
        permission: ACTION_PERMISSION.dryRun,
        summary: "Validate rows without importing",
        body: ImportPayloadInput,
        data: reportRef,
      }),
      validate("json", ImportPayloadInput),
      async (c) => {
        const payload = c.req.valid("json");
        const resource = requireResource(payload.resource);
        const mapping = payload.mapping ?? autoMapping(resource, payload);
        return ok(c, buildDryRun(resource, payload, mapping).report);
      },
    )
    .post(
      "/imports",
      authorize(ctx, ACTION_PERMISSION.import),
      doc({
        tag: "import-export",
        permission: ACTION_PERMISSION.import,
        summary: "Start an import batch",
        body: ImportPayloadInput,
        data: importRef,
      }),
      validate("json", ImportPayloadInput),
      async (c) => {
        const actor = c.get("actor");
        const payload = c.req.valid("json");
        const resource = requireResource(payload.resource);
        const mapping = payload.mapping ?? autoMapping(resource, payload);
        return ok(c, await startImport(ctx.db, { resource, source: payload, mapping, actor }));
      },
    )
    .post(
      "/imports/:id/cancel",
      authorize(ctx, ACTION_PERMISSION.cancel),
      doc({
        tag: "import-export",
        permission: ACTION_PERMISSION.cancel,
        summary: "Cancel a running import",
        data: { type: "object", properties: { cancelled: { type: "boolean" } } },
      }),
      async (c) => ok(c, { cancelled: await cancelImport(ctx.db, c.req.param("id")) }),
    )
    .post(
      "/imports/:id/resume",
      authorize(ctx, ACTION_PERMISSION.resume),
      doc({
        tag: "import-export",
        permission: ACTION_PERMISSION.resume,
        summary: "Resume a cancelled or interrupted import",
        data: { type: "object", properties: { resumed: { type: "boolean" } } },
      }),
      async (c) => ok(c, { resumed: await resumeImport(ctx.db, c.req.param("id")) }),
    )
    .get(
      "/exports/:resource",
      authorize(ctx, ACTION_PERMISSION.export),
      doc({
        tag: "import-export",
        permission: ACTION_PERMISSION.export,
        summary: "Export data for the selected columns",
        query: ExportQueryInput,
        data: exportRef,
      }),
      validate("query", ExportQueryInput),
      async (c) => {
        const resource = requireResource(c.req.param("resource"));
        const query = c.req.valid("query");
        const columns = query.columns
          ?.split(",")
          .map((column) => column.trim())
          .filter(Boolean);
        return ok(
          c,
          await selectExportData(ctx.db, {
            resource,
            ...(columns && columns.length > 0 ? { columns } : {}),
            query: {
              page: 1,
              perPage: query.perPage,
              sort: query.sort ?? resource.columns[0]?.key ?? "createdAt",
              dir: query.dir,
              ...(query.search ? { search: query.search } : {}),
            },
          }),
        );
      },
    );
}

function requireResource(name: string) {
  const resource = importExportResources.get(name);
  if (!resource) {
    throw new ApiError(ErrorCode.validationFailed, 422, "Unknown resource", [
      { path: "resource", message: `no resource named ${name}` },
    ]);
  }
  return resource;
}
