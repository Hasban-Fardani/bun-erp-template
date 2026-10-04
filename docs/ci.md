# CI

The workflow runs gates, PGlite tests, real PostgreSQL tests, web/mobile asset builds and browser QA.
`ci-ok` fails if any required job fails, is skipped or is cancelled. Actions use verified
commit pins. Bun is 1.4.2 and installation uses the frozen lockfile and a lock-keyed cache.

Local equivalents: `bun erp check`, `bun erp test`, `bun erp build`, and `bun run qa`.
For real PostgreSQL use a disposable database: set `TEST_DATABASE_URL` and run `bun erp test`.
The runner creates a unique temporary database and removes it even if the suite fails.
The database login must be allowed to create databases; never point this at production.

Browser QA needs `bunx --bun playwright-core install chromium`, API and Vite preview running,
and `QA_BASE_URL`, `QA_EMAIL`, `QA_PASSWORD`. Preview proxies `/api` to the API. Reports,
screenshots and server logs go in `.data/qa/`; credentials never belong in artifacts.

The mobile build uses a reserved example API origin solely to verify packaging; it does not test native authentication or devices.
`.github/workflows/mobile-release.yml` is separate from pull-request CI. A `v*` tag or manual dispatch uploads a signed Android bundle to Play internal testing and a signed iOS app to TestFlight after the copied application configures its `mobile-release` environment credentials.

Owner action: enable branch protection for master with **ci-ok** required. A workflow file
does not enable that setting. The first GitHub run and branch protection are NOT_RUN until
observed on GitHub. CI creates disposable credentials; deployment secrets are not required.
