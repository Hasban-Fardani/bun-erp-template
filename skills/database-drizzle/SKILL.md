---
name: database-drizzle
description: Use when writing queries, SQL migrations, seed data or database driver changes.
---

# Database and Drizzle

One PostgreSQL dialect; driver selection is in `platform/database/index.ts`.
PGlite defaults to local/test; postgres.js is the production driver.

- Forward-only migrations, one sequence; never delete applied ledger entries.
- UUIDv7 defaults: PG16/17 bootstrap polyfill, PG18 native. Existing 0001 is not replayed.
- Service owns transaction and audit. Input never selects organization.
- Raw execute results differ by driver; use rowsOf().
- Test with the shared harness and isolated PostgreSQL runner; never reset a deployment DB.

Read [testing](../../docs/testing.md) and [deployment](../../docs/deployment.md) for execution details.
