# Testing

bun erp check launches Biome, TypeScript and read-only gates concurrently. All results are collected,
including failures; checks do not build or rewrite files.

bun erp test runs the server, web, mobile, packages/utils, packages/email and packages/pdf suites in sequence. Server tests use
app.request() without a listening port and run in one worker with a 15-second test timeout: their
shared database fixture is truncated between tests, and migration tests close and rebuild that
same context. Running server files concurrently can close a database during an active request or
seed duplicate rows. The longer timeout covers real migration, seed and auth setup; timeout errors
still fail the suite. Default storage is PGlite memory://; TEST_DATABASE_URL instead creates and
drops an isolated PostgreSQL database. The test account needs CREATEDB. Never target production.
`bun erp check` remains parallel because its checks are read-only and independent.

Schema changes need schema/migration parity. Queue tests cover deduplication, concurrent claims,
success, retry and terminal failure. Offline storage tests exercise JSON records, namespace
isolation and deletion through a fake adapter; they do not replace native SQLCipher/device checks.

Web tests cover routes, data-table loading/error states and RPC behavior. TypeScript checks the
generated TanStack route tree. The web build verifies that file routes split into lazy chunks.
Browser QA needs a running API, built web preview and local test credentials. Artifacts live in
ignored .data/qa.

Mobile web-asset builds do not prove Android/iOS plugin execution, encryption, device behavior or
store submission. CI produces Android debug and iOS simulator artifacts; device tests remain
separate. See mobile.md.

Historical run counts are recorded in tasks and riset; do not reuse them as current evidence.
