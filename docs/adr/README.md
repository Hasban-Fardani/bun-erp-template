# Architecture decisions

An accepted decision records a choice, not proof of current behavior. Check the implementation
column and source before relying on it.

| Decision | Current implementation |
|---|---|
| [0001 TanStack file routing](0001-web-router.md) | Generated file routes, authenticated layout and per-route chunks |
| [0002 Valkey queue direction](0002-broker-valkey.md) | Superseded by ADR-0015 |
| [0003 UUIDv7](0003-primary-key-uuidv7.md) | PostgreSQL defaults plus UUIDv7 support for PG16/17 |
| [0004 Organization scope](0004-organization-id-sejak-awal.md) | Present in reference feature schemas |
| [0005 Spreadsheets](0005-spreadsheet-exceljs.md) | Deferred; no spreadsheet library installed |
| [0006 Capacity](0006-deployment-target.md) | Deployment target; capacity still needs measurement |
| [0007 Audit redaction](0007-audit-redaction.md) | Present in audit writes and logging safeguards |
| [0008 Distribution](0008-distribusi-template.md) | Copy/fork policy |
| [0009 Authentication](0009-auth-google-dorman.md) | Email/password; Google activates only with credentials |
| [0010 Database dialect](0010-database-driver.md) | PGlite local/test and PostgreSQL production; mobile SQLite is separate |
| [0011 Deployment](0011-deployment-hybrid.md) | Bun runtime plus shared Cloudflare Worker/assets entry |
| [0012 Agent runtime](0012-agent-runtime-mastra.md) | Deferred; no agent runtime dependency |
| [0013 Form helpers](0013-form-utilities.md) | Platform-first policy |
| [0014 Mobile source](0014-mobile-capacitor.md) | Separate React entry and shared atomic UI; offline local store present, native auth absent |
| [0015 Background jobs](0015-postgres-background-jobs.md) | Durable PostgreSQL queue, Bun polling worker and Cloudflare scheduled adapter |
