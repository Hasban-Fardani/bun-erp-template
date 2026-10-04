# Testing

`bun erp check` launches Biome, TypeScript and read-only gates concurrently. All results
are collected, including failures. The checks do not build or rewrite files.
`bun erp test` runs backend then web; database-sharing tests are not made concurrent.

Backend HTTP tests use `app.request()` without a listening port. `tests/helpers.ts` shares
one migrated database per test process, truncates/reseeds fixtures, and resets permission caches.
Migration tests can dispose it. Cold integration startup has a 30-second budget.
Default is PGlite `memory://`; `TEST_DATABASE_URL` uses an isolated PostgreSQL database
created and deleted by `test-runner.ts`. The test account needs CREATEDB. Never target production.

Schema changes require compiled/uncompiled parity. Web tests cover navigation, Query failure
handling and RPC validation fields; compile-time tests also run through TypeScript.

Browser QA: build web, run API and `bun erp preview`, then `bun run qa` with QA credentials.
Results, screenshots and logs go to ignored `.data/qa`. Browser viewport tests do not prove
native iOS/Android behavior. Use [mobile](mobile.md) for those prerequisites.

[CI](ci.md) runs the configured jobs. Historical run counts live in tasks/research and
must not be reused as results for the current working tree.
