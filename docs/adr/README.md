# Architecture decisions

Accepted means selected, not necessarily implemented. Read only the relevant decision.
The code owns current behavior; historical evidence does not override it.

| Decision | Implementation |
|---|---|
| [0001 Router](0001-web-router.md) | TanStack present; file generation/loaders pending |
| [0002 Valkey](0002-broker-valkey.md) | Planned, no queue/cache |
| [0003 UUIDv7](0003-primary-key-uuidv7.md) | DB defaults; auth still uses Bun generation |
| [0004 Organization](0004-organization-id-sejak-awal.md) | Present |
| [0005 Spreadsheet](0005-spreadsheet-exceljs.md) | Planned, no library installed |
| [0006 Capacity](0006-deployment-target.md) | Target; measure each deployment |
| [0007 Audit redaction](0007-audit-redaction.md) | Present |
| [0008 Distribution](0008-distribusi-template.md) | Copy/fork policy |
| [0009 Auth](0009-auth-google-dorman.md) | Email/password; Google conditional, UI absent |
| [0010 Database](0010-database-driver.md) | PGlite/PostgreSQL |
| [0011 Hybrid](0011-deployment-hybrid.md) | Separate UI/API; Worker pending |
| [0012 Agent runtime](0012-agent-runtime-mastra.md) | Deferred |
| [0013 Form libraries](0013-form-utilities.md) | Platform-first policy |
| [0014 Mobile](0014-mobile-capacitor.md) | Shared React packaging; native auth pending |
