---
name: database-drizzle
description: Use when writing queries, SQL migrations, seed data or database driver changes.
---

# Database and Drizzle

One PostgreSQL dialect; driver selection is in `platform/database/index.ts`.
PGlite defaults to local/test; postgres.js is the production driver.

- Forward-only `NNNN_snake_case.ts` migrations export `up(database)` and execute inside one transaction. Keep the single sequence and applied ledger; the runner maps legacy SQL names by sequence during the format transition.
- UUIDv7 defaults: PG16/17 bootstrap polyfill, PG18 native. Existing 0001 is not replayed.
- Service owns transaction and audit. Input never selects organization.
- Raw execute results differ by driver; use rowsOf().
- `DATABASE_PATH` is the local data directory name, not a driver selector. PGlite is a server-side PostgreSQL-compatible local/test driver; SQLite is only used by the independent mobile offline store.
- Test with the shared harness and isolated PostgreSQL runner; never reset a deployment DB.

Read [testing](../../docs/testing.md) and [deployment](../../docs/deployment.md) for execution details.
