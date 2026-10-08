# Deployment

Use a deployment-owned environment and secret store. Set APP_DEPLOY_TARGET to `bun` or
`cloudflare`, and APP_WEB_MODE to `integrated` or `separate` (Cloudflare requires `integrated`). Set
APP_ENV=production, APP_RELEASE, DATABASE_DRIVER=postgres, DATABASE_URL and a strong
BETTER_AUTH_SECRET. Run bun erp check,
bun erp test, apply forward-only migrations, seed base records and verify readiness. Review each
migration against the target PostgreSQL version before application.

## Bun host

Set `APP_DEPLOY_TARGET=bun`. For integrated hosting, set `APP_WEB_MODE=integrated`; build and run the
semi-monolith with `bun erp build` then `bun start`. One Bun listener serves
the Vite build from `apps/web/dist` at `/` and Hono routes under `/api/*`; client-side routes fall
back to `index.html`, hashed assets get immutable caching, and the entry HTML is revalidated. The
server fails before database bootstrap when the web build is missing. Put it behind a TLS-terminating
reverse proxy on a VPS and keep the application port private to that proxy.

The root Dockerfile builds the integrated web app, installs production dependencies, and runs the Bun
server as the non-root `bun` user. It starts the queue worker alongside HTTP handling. Build with
`docker build -t bun-erp-template .`; supply production settings through the host's secret/environment
manager, not a committed env file. `compose.yaml` is a local development stack with PostgreSQL and
local storage; it binds the app port to loopback and is not a production preset. Production still needs
HTTPS at a reverse proxy, a strong `BETTER_AUTH_SECRET`, `APP_ENV=production`, and durable database
backups. The current template has no file upload feature; the `@bun-erp/storage` package supplies the
server drivers and configuration (see operations.md) before a deployment adds file-backed features.

For a separately hosted frontend, set `APP_WEB_MODE=separate`, build the Vite app, and use
`bun erp server:api`; set `VITE_API_BASE_URL` to the public
HTTPS API origin at web build time. Run a separate `bun erp jobs:work` process for durable jobs. Use
PostgreSQL for API and queue state. Hono applies
secure response headers to API and Bun-hosted web responses. Production responses enable six-month
HSTS without `includeSubDomains`; serve the app over HTTPS through the VPS reverse proxy.

## Cloudflare Workers

Set `APP_DEPLOY_TARGET=cloudflare` and `APP_WEB_MODE=integrated`. wrangler.jsonc is source
configuration for the Cloudflare Vite plugin. `bun erp build` or `bun erp cloudflare:build` generates
a Worker bundle and web assets; deploy the generated
apps/web/dist/bun_erp_template/wrangler.json. The build removes the Vite plugin's generated local
.dev.vars file so local secrets do not remain in the deploy output. The asset directory contains
the Vite client build, not the Worker bundle. /api and /api/* reach the shared Hono Worker and
other paths use the web asset fallback. Hyperdrive supplies PostgreSQL.

The Worker does not run DDL or seed data during requests. The manual Cloudflare workflow runs
checks, tests, migrations and seed before deploy. Configure the Hyperdrive ID, app URL,
CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, DATABASE_URL and BETTER_AUTH_SECRET in the project.
The sections "Production on Cloudflare requires Workers Paid", "Object storage on Cloudflare" and
"Secrets flow" below cover the rest of the production setup.
Local emulation uses .dev.vars.example with a disposable PostgreSQL database.

### Booted Worker proof (2026-10-07)

`bun erp cloudflare:dev` was run against a local PostgreSQL through Hyperdrive and the real Worker
answered on workerd (ephemeral port, found with `lsof -nP -iTCP -sTCP:LISTEN | grep workerd`):

```
GET /api/v1/health -> 200 {"status":"ok"}
GET /api/v1/ready  -> 200 {"status":"ready","checks":{"database":{"ok":true,"ms":44}}}
```

`bun erp check:worker-boot` verifies the prerequisites for that run (`WORKER_BOOT=1`): `wrangler`
resolves, `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` is set (env or
`apps/web/.dev.vars`) and its database answers. The boot itself stays a manual, documented step
because it starts Vite + workerd; run it whenever a change touches the Worker entry or its bindings.

### Target matrix — Bun/VPS and Cloudflare Workers (F3.3 Phase 7)

| Concern | Bun / VPS | Cloudflare Workers |
|---|---|---|
| Entry | `bun apps/server/bootstrap/server.ts` (one listener serves web + `/api/*`) | `apps/server/bootstrap/cloudflare-entry.ts` (fetch + scheduled + queue handlers) |
| Database | postgres.js directly; `DATABASE_SSL_MODE` must be `require`/`verify-full` in production | Hyperdrive binding; `DATABASE_SSL_MODE=disable` is allowed because Hyperdrive terminates TLS |
| Migrations / seed | `bun erp db:migrate`, `db:seed`, `db:reset --force` (local/test only) | never in the Worker graph — `check:worker` fails if a DDL path is reachable; the deploy workflow migrates before deploy |
| Jobs | durable `background_jobs` + the polling worker (`jobs:work`), scheduler ticks every 5 s | same table; cron `*/5` sweeps and the optional `JOBS_QUEUE` wake-up signals new work after commit |
| Scheduler | tick inside `jobs:work` | tick inside the `scheduled` handler |
| Rate limiting | Better Auth `storage: "database"` (shared across processes) | same table through Hyperdrive (per-isolate memory would be bypassable) |
| Permission cache | `PERMISSION_CACHE_ENABLED=true` is safe (per-process, 10 s TTL, database is the source of truth) | set `false` in `wrangler.jsonc`; every isolate would otherwise hold its own copy |
| Mail | `log`, `memory`, or `smtp` | `log`/`memory`/HTTP driver; **`smtp` is refused** (no raw sockets) |
| Storage | `local` (dev/test only), `s3`, `memory` | `r2` binding or `memory`; **`s3` is refused** (needs `Bun.S3Client`); `local` is refused in production |
| Web assets | `APP_WEB_MODE=integrated` (Bun serves `apps/web/dist`) | Workers Static Assets; **non-integrated is refused** |
| API docs | `/api/docs` + `/api/openapi.json` follow `API_DOCS_ENABLED` (off by default in production) | same routes, but the Scalar reference page is loaded on the Bun target only (the Worker serves `/api/openapi.json`) |
| Secrets | `BETTER_AUTH_SECRET` required outside development (≥32 chars in production) | same, pushed with `wrangler secret bulk` (`bun erp env:cloudflare`); secret-class keys never sit in `wrangler.jsonc` vars |
| Local speed | Bun-first: `check:fast` < 1.5 s, `--help` < 120 ms; `bun-first` gate bans sync Node IO and Bun-only APIs leaking into the Worker graph | the Worker graph is validated by `check:worker`; bundle and startup budget in the table above |

Both targets share one codebase, one schema and one queue table; the differences above are the whole
list. A configuration that would be unsafe on either target is refused by `templates/apps/server/config/schema.ts`
at boot, with a test per guard.

### Measured Worker budget (F3.3 Phase 0, 2026-10-07, commit 1a2d76e)

| Measurement | Value | How |
|---|---|---|
| Wrangler dry-run upload | **3,025.90 KiB raw / 530.64 KiB gzip** | `bunx --bun wrangler deploy --dry-run --outdir /tmp/wrangler-dry` after `bun erp cloudflare:build` |
| Gate bundle (`Bun.build`, browser/workerd target) | ~1.04 MB raw / ~288 KB gzip | `bun erp check:worker` |
| Vite Cloudflare Worker build | 1,244,243 B raw / 321,552 B gzip | `bun erp cloudflare:build` |
| Worker startup time | not reported by this Wrangler version | the dry run prints size and bindings only; measure in the dashboard |
| Script size cap | 64 MiB uncompressed on Free and Paid, no compressed limit | Cloudflare Workers limits page, re-checked 2026-10-08 (F3.4) |
| scrypt sign-in cost | ~110 ms CPU per hash/verify locally | `better-auth/crypto`, N=16384 r=16 p=1 dkLen=64, Bun 1.4.2 on Apple silicon — about ten times the 10 ms Free budget |
| Jobs throughput, cron only | 288 ticks/day × batch 1 = 288 jobs/day | `wrangler.jsonc` cron `*/5`; a 1,000-job burst is ~3.5 days |

The dry-run bundle is larger than the gate bundle because Wrangler bundles with `nodejs_compat` and a
different resolver; both are far inside the cap, so size is not the constraint — CPU and startup are.

**Bun/DDL hits in the real dry-run bundle (12):** every one is guarded, verified by reading the
emitted source around each hit:

| Hit | Count | Where | Why it is safe |
|---|---|---|---|
| `Bun.env` | 2 | better-auth env helper; the app's `runtimeEnv()` | both behind `typeof Bun === "undefined"` checks |
| `Bun.file` | 4 | local storage driver | the driver factory throws "local storage needs the Bun runtime" on Workers |
| `Bun.write` | 1 | local storage driver `put` | same factory guard |
| `Bun.S3Client` | 4 | s3 storage driver | same factory guard |
| `migrate(` | 1 | Kysely's own `Migrator.migrate()` | a dependency API, not this app's DDL; `database/migrate.ts` is not in the graph |

`bun erp check:worker` (part of `bun erp check`) bundles this entry for a browser/workerd-like target
and fails when a Bun global without a `typeof Bun` guard, a new Node built-in, a migration/seed
module or an over-budget script reaches it. The Vite Cloudflare build of this template measured
1,244,243 bytes raw / 321,552 bytes gzip (314 KiB) for the Worker script; the gate's own `Bun.build`
bundle is ~1.04 MB raw / ~288 KB gzip. Cloudflare caps a Worker script at **64 MiB uncompressed**
on both Free and Paid and has no compressed limit (only the wrangler "Total Upload" figure counts), so
the gate keeps one template budget of **2 MiB uncompressed** on its own bundle, about twice today's
size. The gate constant is `WORKER_RAW_BUDGET_BYTES` in `cli/gates/worker-gate.ts`; its failure message
and this section state the same numbers, and a test pins that.

The API reference UI (Scalar) is never part of the Worker script: `http/build-app.ts` builds the app
without it and only `http/app.ts` (the Bun entry) adds `/api/docs`. F3.4 B6 measured the Worker gate
bundle at 1,043,345 B raw / 289,326 B gzip before and 1,040,722 B raw / 288,292 B gzip after, which
includes the new file route (Scalar's Hono wrapper is small because the page loads its viewer from
a CDN). The gate now fails if any `@scalar/*` import reaches the Worker graph.

The permission cache (`PERMISSION_CACHE_ENABLED`, default true) is a per-process `Map` with a
10-second TTL; PostgreSQL is always the source of truth. On Workers every isolate has its own copy,
so a role change handled by one isolate is invisible to the others until the TTL expires. The
deploy config sets `PERMISSION_CACHE_ENABLED=false`; do the same for multi-replica Bun. With the
cache off, every authorized request runs the RBAC join once (more Hyperdrive statements, no stale
grants). See [security](security.md).

### Jobs on Workers

The Worker runs the same durable PostgreSQL queue as the Bun host. Feature writes enqueue inside
their database transaction; that row is the outbox and the only source of truth. Two consumers
drain it:

- **Cron sweeper (always on).** The five-minute Cron Trigger runs due schedules and then claims
  jobs while it stays under a 10-second wall-clock budget, at most 10 per invocation. There are
  `24 * 60 / 5 = 288` sweeps per day. With the previous one-job-per-tick default, cron-only mode
  drained at most 288 jobs per day, so a burst of 1,000 queued jobs took about 3.5 days to clear.
  The time budget raises that ceiling, but each sweep still has to fit the plan's CPU budget (10 ms on Free),
  so treat cron-only mode as the recovery path for lost wake-ups, not a throughput path.
- **Queue wake-up (opt-in).** After a transaction commits, the Worker sends one `{ jobId }` message
  to the `JOBS_QUEUE` producer. The consumer calls `runJobById`, which re-claims the row with the
  same `skip locked` lease update as the polling worker and is a no-op when the job is already
  claimed or finished. Queue mode is near-real-time, and duplicate or out-of-order signals are
  harmless.

The queue never replaces the database. A message that is lost, delayed, or redelivered only delays
a job; it can never lose one, because the row is committed before the signal is sent and the cron
sweeper keeps polling. To enable queue mode on a Queues-enabled account:

1. Create the queue: `bun run --cwd apps/web wrangler queues create bun-erp-template-jobs`.
2. Set `JOBS_WAKEUP_DRIVER=cloudflare-queue` (wrangler.jsonc `vars`), uncomment the `queues`
   producer/consumer block in wrangler.jsonc, then run `bun erp cloudflare:build` and deploy.
3. The default `JOBS_WAKEUP_DRIVER=none` keeps an account without Queues working on the cron
   sweeper alone; a `cloudflare-queue` selection without the binding logs
   `jobs.wake_up.binding_missing` and falls back to `none`.

Keep handlers idempotent and split CPU-heavy tasks into smaller jobs. Monitor dead jobs through the
operational commands. See operations.md and ADR-0015.

Before deployment, the workflow checks the live Hyperdrive config through the Cloudflare API. Give
`CLOUDFLARE_API_TOKEN` Hyperdrive Read access for that lookup. Hyperdrive query caching must be
disabled because the same connection serves sessions and permission checks. The preflight also
requires its origin host, port, database and scheme to match `DATABASE_URL`, which is used for
migrations and seeding in CI. Disable caching when creating or updating the config, then verify it
in the Cloudflare dashboard before the first run. With the repository's Wrangler installation, run
`bun run --cwd apps/web wrangler hyperdrive update <HYPERDRIVE_ID> --caching-disabled`.

### Workers Free plan

The template uses one Worker for `/api` and `/api/*`, plus Workers Static Assets for the web app.
Static asset requests do not invoke the Worker; API and scheduled-job invocations do. The current
Workers Free limits are 100,000 HTTP Worker requests per day and 10 ms CPU per HTTP request or Cron
invocation. The preflight rejects configurations that route frontend traffic through the Worker. Workers Free
is fine for a staging or demo deploy, but production needs Workers Paid (see below). Hyperdrive is available on Free with
a current limit of 100,000 database statements per day. These are account quotas: operations that
exceed a limit can fail until the quota resets. Check Cloudflare's live
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[platform limits](https://developers.cloudflare.com/workers/platform/limits/), and
[Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
before a production launch. Hyperdrive's Free query quota is documented in its
[pricing guide](https://developers.cloudflare.com/hyperdrive/platform/pricing/).

The static build includes `apps/web/public/_headers` for browser security headers and asset caching.
Cloudflare serves those assets directly; the Worker applies Hono security headers to API responses.
This keeps the single-deployment shape aligned with the Bun semi-monolith without routing web assets
through Worker CPU or request quotas.

Cloudflare Free does not provide this template's PostgreSQL database. Hyperdrive is the free
connection pool/proxy; the PostgreSQL 16, 17, or 18 origin must be provisioned with a provider that
accepts Hyperdrive connections. Provider availability, storage limits, and database charges are
separate from Cloudflare Workers. The deploy workflow therefore requires a real Hyperdrive ID,
`DATABASE_URL`, `CLOUDFLARE_APP_URL`, Cloudflare API credentials, and `BETTER_AUTH_SECRET`; the
all-zero Hyperdrive ID in the template is deliberately rejected by preflight. Keep the Worker and
Hyperdrive within their Free quotas, and check the database provider's own free-plan conditions.

The Cron trigger still polls PostgreSQL when the queue is empty, about 288 times per day with the
default five-minute schedule. API/auth traffic and job handlers consume additional Worker CPU and
Hyperdrive statements. Better Auth's default password hashing uses scrypt; Cloudflare notes that
authentication workloads can use 10–20 ms CPU, above the Free per-invocation limit. The template's
own sign-in path was measured locally at ~110 ms CPU per hash or verify (median of 15 runs;
`better-auth/crypto` `hashPassword`/`verifyPassword` with scrypt N=16384, r=16, p=1, dkLen=64;
Bun 1.4.2 on Apple silicon; wall time via `performance.now()`, CPU via `process.cpuUsage()`), roughly
ten times the Free budget. Do not weaken password hashing to fit a quota; production on Cloudflare uses
Workers Paid (next section). A template build and local dry run can verify the bundle and bindings, but
only a deployment using the target account, real database, and secrets can verify runtime CPU and
external services end to end.

### Production on Cloudflare requires Workers Paid

Password sign-in costs ~110 ms CPU and Workers Free allows 10 ms CPU per invocation (Paid: 30 s by
default, 5 minutes at most). The preflight therefore fails a production deploy
(`vars.APP_ENV=production`) unless `wrangler.jsonc` sets `limits.cpu_ms` to at least **200**
(`MIN_PAID_CPU_MS` in `cli/lib/cloudflare.ts`); the template ships `cpu_ms: 500`. Cloudflare's docs
list Free at a fixed 10 ms and describe raising `limits.cpu_ms` as a Paid setting; they do not say
whether a Free account rejects a larger value at deploy or keeps 10 ms, so treat Free as unable to
run sign-in and check the CPU metric after the first deploy. A staging deploy (`APP_ENV` other than
`production`) is not enforced. The VPS/Bun target has no such limit and remains the default
production target.

### Object storage on Cloudflare

- **R2 binding.** `wrangler.jsonc` declares `r2_buckets` with binding `STORAGE` (the name
  `STORAGE_R2_BINDING` selects). Create the bucket first:
  `bun run --cwd apps/web wrangler r2 bucket create bun-erp-template-files`. Preflight fails when
  `STORAGE_DRIVER=r2` has no matching binding with a `bucket_name`.
- **`s3` is not supported on Workers.** The `s3` driver uses `Bun.S3Client`; preflight fails a
  Cloudflare config with `STORAGE_DRIVER=s3`. Use `r2` on Workers and `s3` on the Bun target (R2's
  S3 endpoint works from Bun and from the CLI).
- **File route.** `GET /api/v1/files/:key{.+}` streams the object from the active driver. It needs
  a session (401 otherwise), answers 404 for a missing key and 400 for an unsafe key such as
  `../x`, and returns `Content-Type`, a content-hash `ETag` (`If-None-Match` answers 304),
  `Cache-Control: private, max-age=0, must-revalidate`, `nosniff` and a sandboxing CSP. The route
  lives under `/api` because the Worker only runs for `/api` and `/api/*`; set `STORAGE_PUBLIC_URL`
  to `<APP_URL>/api/v1/files` (preflight checks this on Cloudflare). R2 bindings cannot presign, so
  files stay private behind the session. A feature that needs per-file permissions checks them
  before linking to a file.
- **`storage:copy`.** `bun erp storage:copy --from <prefix|current> --to <prefix|current>
  [--key-prefix <path/>] [--dry-run]` copies every object between two configured stores. A prefix
  names an environment namespace: `SOURCE_` reads `SOURCE_STORAGE_DRIVER`, `SOURCE_S3_BUCKET`,
  `SOURCE_S3_ENDPOINT` and so on; `current` reads the live `STORAGE_*` / `S3_*` keys. Objects
  already at the destination with the same size are skipped, so an interrupted copy resumes by
  re-running the same command. It prints a summary and exits 1 if any object failed. Content types
  are re-derived from the key extension. The CLI cannot hold a Worker binding, so reach R2 through
  its S3 endpoint with the `s3` driver (`S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`,
  `S3_REGION=auto`, R2 API token keys).

### Secrets flow

One list decides what is secret (`isSecretKey` in `cli/lib/cloudflare.ts`): `BETTER_AUTH_SECRET`,
`DATABASE_URL` and any key ending `_SECRET`, `_PASSWORD`, `_API_KEY`, `_ACCESS_KEY_ID`,
`_SECRET_ACCESS_KEY`, `_TOKEN` or `_PRIVATE_KEY`. `bun erp env:cloudflare [--env-file .env] [--write]`
splits an env file: secrets go to `.data/cloudflare-secrets.json` (git-ignored; only key names are
printed) and the rest can be merged into the `wrangler.jsonc` `vars` block with `--write` (comments
and layout are kept). `DATABASE_URL` is not pushed because the Worker reads its connection from the
Hyperdrive binding; it stays a CI secret for migrations. Push the file with
`bun run --cwd apps/web wrangler secret bulk ../../.data/cloudflare-secrets.json`. The deploy
workflow does this for every secret before `wrangler deploy`, and preflight fails when a secret-class
key holds a value inside `vars`. Local `wrangler dev` secrets go in `.dev.vars` (copy
`.dev.vars.example`).

### Moving between targets (runbook)

Both targets share one codebase, schema and queue table, so a move is data and configuration, not
code. Do each move in a maintenance window: put the old side read-only, copy, switch, verify.

**VPS (Bun) to Cloudflare**

1. Database: provision a Hyperdrive config on the same PostgreSQL (or restore a dump into a
   Hyperdrive-reachable host), disable Hyperdrive query caching, set the real ID in `wrangler.jsonc`.
2. Storage: create the R2 bucket, then run `storage:copy` with `SOURCE_*` pointing at the VPS store
   (`local` root or `s3`) and the destination as `s3` against R2's S3 endpoint. Re-run until it
   reports 0 copied, then set `STORAGE_DRIVER=r2` and `STORAGE_PUBLIC_URL=<APP_URL>/api/v1/files`.
3. Secrets: `bun erp env:cloudflare --write`, then push with `wrangler secret bulk`. Keep the same
   `BETTER_AUTH_SECRET` or every session and verification link becomes invalid.
4. `APP_URL`: a new origin invalidates session cookies (users sign in again) and every link already
   emailed. Update `APP_URL`, `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS` and `CLOUDFLARE_APP_URL` together.
5. Queue backlog: let `jobs:work` drain the Bun side first. Queued rows live in PostgreSQL and move
   with the database, but handlers are at-least-once, so a job claimed mid-move can run twice.
6. Cron granularity: Cloudflare sweeps every 5 minutes instead of the 5-second Bun poll, so job
   latency rises unless the optional Queues wake-up is enabled.
7. Plan: the account must be on Workers Paid (see above). Deploy, then check `/api/v1/ready`.

**Cloudflare to VPS (Bun)**

1. Database: point `DATABASE_URL` at PostgreSQL directly with `DATABASE_SSL_MODE=require` or
   `verify-full` (`disable` is refused on Bun in production; Hyperdrive no longer terminates TLS).
2. Storage: `storage:copy --from SOURCE_ --to current` with `SOURCE_*` set to the R2 S3 endpoint and
   the destination `s3` (`local` is refused in production). Set `STORAGE_PUBLIC_URL` to the new
   `/api/v1/files` origin.
3. Secrets: Cloudflare secrets are write-only, so take the originals from your secret manager and
   put them in the host's environment.
4. `APP_URL` and session impact: same as above in reverse.
5. Queue backlog: the `background_jobs` table moves with the database. Stop the Worker cron first so
   two consumers do not run side by side, then start `jobs:work`.
6. Cron granularity: the Bun scheduler ticks every 5 s and the Worker `scheduled` handler stops.
   `PERMISSION_CACHE_ENABLED=true` is only safe for a single process.

**Jobs throughput on Workers.** Each cron sweep (every 5 minutes, 288 per day) runs up to 10 jobs
within a 10-second wall-clock budget, so cron-only capacity is up to 2,880 jobs per day; enable the
Queues wake-up for near-real-time delivery.

## PostgreSQL versions

Fresh PostgreSQL 16/17 databases receive the UUIDv7 polyfill in migration 0001; PostgreSQL 18 uses
native UUIDv7. A database that already recorded migration 0001 will not replay it. Check the function
on an existing PG16/17 database before an upgrade; never erase the migration ledger.

Native mobile build/release workflows and signing prerequisites are described in mobile.md.
