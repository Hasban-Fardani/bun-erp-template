---
name: database-drizzle
description: Use when writing queries, SQL migrations, seed data or database driver changes.
---

# Database and Drizzle

One PostgreSQL dialect and one postgres.js driver in every server environment, including tests.
Provide a disposable PostgreSQL URL for tests; test fixtures must never use deployment data.

- Forward-only `NNNN_snake_case.ts` migrations export `up(database)` and execute inside one transaction. Keep the single sequence and applied ledger; the runner maps legacy SQL names by sequence during the format transition.
- UUIDv7 defaults: PG16/17 bootstrap polyfill, PG18 native. Existing 0001 is not replayed.
- Service owns transaction and audit. Input never selects the actor, tenant or scope.
- Normalize raw `execute()` results with `rowsOf()` at the database boundary.
- The server does not support file-backed databases. SQLite is used only by the independent mobile offline store.
- Test with the shared harness and isolated PostgreSQL runner; never reset a deployment DB.

Read [testing](../../docs/testing.md) and [deployment](../../docs/deployment.md) for execution details.
