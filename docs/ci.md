# CI

`apps/` is a disposable install of the catalog, so the shared setup action runs
`bun erp init --apps server,web --yes` after the frozen install: every gate, test, build and QA job
starts from the reference server+web combination. Change that command in
`.github/actions/setup/action.yml` to test a different combination.

CI starts lean: every push and pull request runs only `gates` (lint + `bun erp check`) and
`test-postgres` (migrations twice, status, `bun erp test` on PostgreSQL 18). Browser QA (`e2e`)
and the Docker image run on demand from Actions → CI → Run workflow. To scale up, remove the
`if: github.event_name == 'workflow_dispatch'` line from a job (and its name from `OPTIONAL` in
`ci-ok`), or add a PostgreSQL version back as a matrix when you support more than one.
`.github/workflows/mobile-build.yml` runs only when `apps/mobile`, `packages/` or `bun.lock`
change. `ci-ok` fails if a required job fails, is cancelled or is unexpectedly skipped. CI writes
`APP_ENV=test`: its service database has no TLS and its URLs are plain http, which production
refuses at boot. Actions use verified
commit pins. Bun is 1.4.2 and installation uses the frozen lockfile and a lock-keyed cache.

Local equivalents: `bun erp check`, `bun erp test`, `bun erp build`, and `bun run qa`.
For real PostgreSQL use a disposable database: set `TEST_DATABASE_URL` and run `bun erp test`.
The runner creates a unique temporary database and removes it even if the suite fails.
The database login must be allowed to create databases; never point this at production.

Browser QA needs `bunx --bun playwright-core install chromium`, API and Vite preview running,
and `QA_BASE_URL`, `QA_EMAIL`, `QA_PASSWORD`. The existing `bun run qa` gate also checks the
users screen at 320, 360, 390, 430, 767, 768, 1024, and 1440 CSS pixels for horizontal overflow,
aligned controls and card fields, contained row actions, and 44-pixel mobile touch targets.
Preview proxies `/api` to the API. Reports, screenshots and server logs go in `.data/qa/`;
credentials never belong in artifacts.

The mobile build uses a reserved example API origin solely to verify packaging; it does not test native authentication or devices.
`.github/workflows/mobile-build.yml` and `.github/workflows/mobile-release.yml` detect `apps/mobile` first and skip their jobs while the catalog app is absent. A `v*` tag or manual dispatch uploads a signed Android bundle to Play internal testing and a signed iOS app to TestFlight after the copied application configures its `mobile-release` environment credentials.

Owner action: enable branch protection for the default branch with **ci-ok** required and
pull-request review required, so no agent push reaches it unchecked and a human approves task status
(`task-approval` and the `tdd: required` evidence grammar run inside `bun erp check` there). This is
a GitHub setting; the template does not automate it. Local `.githooks/pre-push` can be skipped with
`--no-verify`, so CI is the final judge. A workflow file
does not enable that setting. The first GitHub run and branch protection are NOT_RUN until
observed on GitHub. CI creates disposable credentials; deployment secrets are not required.
