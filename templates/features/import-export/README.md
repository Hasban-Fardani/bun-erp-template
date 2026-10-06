# `import-export`

Opt-in feature: a column-mapped import pipeline with a dry-run report, batch progress and cancel,
plus server-driven CSV/XLSX export through the same list contract the resource's screen uses.

```
bun erp features:install import-export
```

The installer copies the server module and the web screen, wires the `import-export` permission
resource, the audit entity, the `/api/v1/import-export` route mount, the sidebar entry, the
`en-US`/`id-ID` keys and the design spec. It installs the `spreadsheet` and `data-table` catalog
packages and declares them on `apps/web`: the browser parses the uploaded file and writes the
exported file through `@bun-erp/spreadsheet`, so the server never handles raw file bytes and the
format engines stay in the web bundle behind that one package boundary.

## What you must add after install

1. **Register your resources.** The feature is generic; the app owns the domain. Call
   `registerImportExportResource` from a composition module (for example
   `apps/server/features/jobs.ts` or an app bootstrap file) with:

   ```ts
   registerImportExportResource({
     name: "departments",
     label: "Departments",
     columns: [
       { key: "name", header: "Name", required: true, width: 24 },
       { key: "code", header: "Code", required: true },
     ],
     validateRow: (values) => (values.code ? [] : [{ column: "code", code: "REQUIRED", message: "Code is required" }]),
     importRow: async (db, values) => {
       // Idempotent upsert: a resumed batch can deliver the same row again.
     },
     list: listDepartments, // the same service the resource's table endpoint calls
   });
   ```

2. **Register the batch handler** in `apps/server/features/jobs.ts`:

   ```ts
   import { registerImportExportBatchHandlers } from "./import-export/jobs.ts";
   // inside createBatchHandlers(ctx):
   registerImportExportBatchHandlers(handlers, ctx);
   ```

   Without this step the import endpoints still create batches, but the runner job dies with
   `JOB_HANDLER_NOT_REGISTERED` and nothing is imported. The completion notification (in-app,
   database channel) is sent by the same handler.

## Endpoints

- `GET /api/v1/import-export/resources` — registered resources and their columns.
- `POST /api/v1/import-export/imports/dry-run` — JSON `{ resource, headers, rows, mapping? }`
  (the browser parses the file); returns the report with row-level errors. Without `mapping` the
  server matches headers to column headers case-insensitively.
- `POST /api/v1/import-export/imports` — same body; creates the batch and enqueues the runner.
- `GET /api/v1/import-export/imports/:id` — progress (`processed`/`failed`/`total`/`status`).
- `POST /api/v1/import-export/imports/:id/cancel` and `.../resume`.
- `GET /api/v1/import-export/exports/:resource?columns=...` — JSON `{ columns, rows }` from the
  list contract (`sort`, `dir`, `search` honoured); the browser writes CSV or XLSX.

Permissions: `import-export.read` (list/progress/export), `import-export.create` (dry-run/import),
`import-export.update` (cancel/resume).

## Limits

- CSV and XLSX only; parsing happens in the browser through `@bun-erp/spreadsheet`.
- At most 50,000 rows per import; the dry-run report keeps the first 200 errors.
- Item handlers run at-least-once; `importRow` must be idempotent.
