# Architecture decisions

An accepted decision records a choice, not proof of current behavior. Check the implementation
column and source before relying on it. Decisions that no longer describe the code are removed;
their history stays in `docs/tasks/`.

| Decision | Current implementation |
|---|---|
| [0001 TanStack file routing](0001-web-router.md) | Generated file routes, authenticated layout and per-route chunks |
| [0003 UUIDv7](0003-primary-key-uuidv7.md) | PostgreSQL defaults plus UUIDv7 support for PG16/17 |
| [0005 Spreadsheets](0005-spreadsheet-exceljs.md) | `@bun-erp/spreadsheet` (ExcelJS + papaparse) and the `import-export` catalog feature; opt-in |
| [0007 Audit redaction](0007-audit-redaction.md) | Present in audit writes and logging safeguards |
| [0009 Authentication](0009-auth-google-dormant.md) | Email/password; Google activates only with credentials |
| [0010 Database dialect](0010-database-driver.md) | PostgreSQL through postgres.js everywhere; mobile SQLite is separate |
| [0011 Deployment](0011-deployment-hybrid.md) | Bun runtime plus shared Cloudflare Worker/assets entry |
| [0013 Form helpers](0013-form-utilities.md) | Platform-first policy |
| [0014 Mobile source](0014-mobile-capacitor.md) | Separate React entry and shared atomic UI; offline local store present, native auth absent |
| [0015 Background jobs](0015-postgres-background-jobs.md) | Durable PostgreSQL queue, Bun polling worker and Cloudflare scheduled adapter |
| [0016 Cache and events](0016-cache-and-events.md) | `infra/cache` facade (memory, database, Cloudflare KV) and transactional events on the job queue |

<!-- template-only -->
Template-lifecycle decisions live in `docs/template/` and are deleted by `bun erp project:adopt`:

| Decision | Current implementation |
|---|---|
| [0006 Capacity](../template/adr-0006-capacity.md) | Superseded: the capacity target is Cloudflare Workers Free |
| [0008 Distribution](../template/adr-0008-template-distribution.md) | Copy/fork policy and the template scope boundary |
<!-- /template-only -->

