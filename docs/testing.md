# Testing

bun erp check launches Biome, TypeScript and read-only gates concurrently. All results are collected,
including failures; checks do not build or rewrite files.

bun erp test runs the server, web and shared package suites in sequence, plus the mobile suite when
the catalog app is installed. `bun erp test --filter <feature>` runs only that feature's server tests
under `apps/server/tests/features/<feature>`. Server tests use `hono/testing` `testClient(app)` without a listening
port and run in one worker with a 30-second test timeout (the same budget as `bunfig.toml`; set
`TEST_TIMEOUT_MS` to change it for one run): their shared database fixture is truncated
between tests, and migration tests close and rebuild that same context. Running server files
concurrently can close a database during an active request or seed duplicate rows. The longer
timeout covers real migration, seed and auth setup; timeout errors still fail the suite.
`TEST_DATABASE_URL` is required and must point to a disposable PostgreSQL server with CREATEDB
permission; the runner creates and drops a uniquely named `erp_test_*` database. Never use
`DATABASE_URL` or production credentials as a test target.
`bun erp check` remains parallel because its checks are read-only and independent.

`tests/support/fixtures.ts` owns the typed client: `createHttpFixture()` exposes `client` (the
session cookie is applied through the client's request options, so every call after sign-in is
authenticated), `createSeededApp()` exposes an anonymous `client`, and `createTestClient(app, cookie?)`
builds a client for another identity or an anonymous caller (the fourth `testClient` argument
carries the cookie, so it is applied to every call). Raw `app.request` stays only for calls the typed client
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

Historical run counts are recorded in docs/tasks; do not reuse them as current evidence.

## Fixtures, factories and job tests

The real fixture file is `apps/server/tests/support/fixtures.ts` (source of truth:
`templates/apps/server/tests/support/fixtures.ts`). Pick the lightest one that fits:

| Need | Use |
|---|---|
| Typed HTTP calls as the seeded owner | `createHttpFixture()` then `await api.signInAsOwner()`; call `api.client.api.v1.<feature>.$get(...)` |
| An anonymous or second-identity client | `createTestClient(app, cookie?)` |
| Routes, CORS or the OpenAPI document without a session | `createSeededApp()` |
| Service-level tests with no HTTP app | `createSeededContext()` (clean database, RBAC seeded) |
| Another user | `createFixtureUser(db, email)` |

Every fixture truncates all tables first, so a test starts from a known database and never depends
on a previous file.

**Factories** build rows for tests and seeders without a faker dependency. `defineFactory(table,
(n) => values)` in `apps/server/database/factories/define.ts` returns `make()` (values only),
`create(db, overrides)`, `createMany(db, count, overrides)` and `reset()`. The sequence `n` starts
at 1 per factory, so generated values are deterministic and unique within a run. Overrides always
win. A column no factory can invent (a foreign key) is marked `requiredOverride("userId")`, and
`make`/`create` throw by name when the caller did not pass it.

```ts
import { invoicesFactory } from "@/database/factories/invoices.ts";

const rows = await invoicesFactory.createMany(api.ctx.db, 3);
const owned = await notificationsFactory.create(api.ctx.db, { userId: me.userId });
```

`bun erp make:feature` writes a factory for the new table and its generated test uses it;
`bun erp make:factory <feature>` adds one for an existing schema, filling every notNull column that
has no database default. A factory takes a `Database` or a transaction, so it also works inside
`db.transaction`.

**Job tests** must not share the `default` queue. `tests/support/jobs.ts` gives every test a private
queue (`createJobTest()` returns `{ db, queue }`), a silent logger, and `waitFor(check, label)` for
asserting on an event instead of sleeping. `startJobWorker` and `runJobBatch` accept `queue`, so a
worker only claims that test's rows. Prefer `waitFor` over `Bun.sleep`: a loaded machine then makes
the test slower, never wrong.

**Generators** emit tests that follow these rules: `make:test <feature>` writes a `testClient`
skeleton, `make:job` an idempotency test, `make:listener` a dispatch/rollback test, `make:notification` and `make:mail` a delivery test.

**CLI performance.** `ERP_PERF=1 bun test apps/server/tests/unit/cli-perf.test.ts` measures
`bun erp --help` and `bun erp check:fast` on an idle machine and fails when either exceeds its
budget. Budgets are three times the recorded baseline (see the test header for the numbers and the
date); the test is skipped in the normal suite because wall-clock budgets are meaningless on a busy
machine.
