# Testing

bun erp check launches Biome, TypeScript and read-only gates concurrently. All results are collected,
including failures; checks do not build or rewrite files.

bun erp test runs the server, web and shared package suites in sequence, plus the mobile suite when
the catalog app is installed. Server tests use `hono/testing` `testClient(app)` without a listening
port and run in one worker with a 15-second test timeout: their shared database fixture is truncated
between tests, and migration tests close and rebuild that same context. Running server files
concurrently can close a database during an active request or seed duplicate rows. The longer
timeout covers real migration, seed and auth setup; timeout errors still fail the suite.
`TEST_DATABASE_URL` is required and must point to a disposable PostgreSQL server with CREATEDB
permission; the runner creates and drops a uniquely named `erp_test_*` database. Never use
`DATABASE_URL` or production credentials as a test target.
`bun erp check` remains parallel because its checks are read-only and independent.

`tests/support/fixtures.ts` owns the typed client: `createHttpFixture()` exposes `client` (the
session cookie is applied through the client's request options, so every call after sign-in is
authenticated), `createSeededApp()` exposes an anonymous `client`, and `testClientFor(app, cookie)`
builds a client for a second identity. Raw `app.request` stays only for calls the typed client
cannot express — Better Auth's wildcard `/auth/*` endpoints, CORS preflight, HEAD, the OpenAPI
document, query values outside the validated allowlist, and bodyless requests — each with a
one-line comment saying why.

Schema changes need schema/migration parity. Queue tests cover deduplication, concurrent claims,
success, retry and terminal failure. Offline storage tests exercise JSON records, namespace
isolation and deletion through a fake adapter; they do not replace native SQLCipher/device checks.

Web tests cover routes, form feedback and RPC behavior; the opt-in data-table package carries its
own table state tests and runs them once installed. TypeScript checks the generated TanStack route
tree. The web build verifies that file routes split into lazy chunks.
Browser QA needs a running API, built web preview and local test credentials. Artifacts live in
ignored .data/qa.

Mobile web-asset builds do not prove Android/iOS plugin execution, encryption, device behavior or
store submission. CI produces Android debug and iOS simulator artifacts; device tests remain
separate. See mobile.md.

Historical run counts are recorded in tasks and riset; do not reuse them as current evidence.
