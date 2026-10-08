---
name: testing
description: Use when writing bun:test tests or debugging server and web test failures.
---

# Testing

Read [testing](../../docs/testing.md). Backend fixtures share one migrated database per
process through `tests/support/fixtures.ts`; truncate/reseed and reset permission caches per case.
Do not create a database per file or run those cases concurrently.

Exercise HTTP with the typed `hono/testing` `testClient(app)` from the fixtures: `createHttpFixture()`
exposes `client` with the session cookie already applied, `createSeededApp()` exposes an anonymous
`client`, and `createTestClient(app, cookie)` covers a second identity. Keep raw `app.request()` only
where the typed client cannot express the call (Better Auth's wildcard `/auth/*`, CORS preflight,
HEAD, the OpenAPI document, query values outside the validated allowlist, bodyless requests), each
with a one-line comment saying why. Use actual database behavior, not heavy mocks.
Add a failing regression case before fixing a defect; keep assertions meaningful.
Compiled Zod schema changes require raw/compiled parity coverage.
Run `bun erp test` and checks; record actual output. Browser/native claims require execution
on those surfaces, rather than inferring success from an HTTP 200.
