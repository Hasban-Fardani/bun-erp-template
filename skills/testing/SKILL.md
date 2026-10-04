---
name: testing
description: Use when writing bun:test tests or debugging server and web test failures.
---

# Testing

Read [testing](../../docs/testing.md). Backend fixtures share one migrated database per
process through `tests/helpers.ts`; truncate/reseed and reset permission caches per case.
Do not create a database per file or run those cases concurrently.

Exercise HTTP with `app.request()`. Use actual database behavior, not heavy mocks.
Add a failing regression case before fixing a defect; keep assertions meaningful.
Compiled Zod schema changes require raw/compiled parity coverage.
Run `bun erp test` and checks; record actual output. Browser/native claims require execution
on those surfaces, rather than inferring success from an HTTP 200.
