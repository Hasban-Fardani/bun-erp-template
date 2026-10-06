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
Local emulation uses .dev.vars.example with a disposable PostgreSQL database.

The Worker has a five-minute Cron Trigger and processes at most one job per tick. This keeps idle
queue polling and per-tick work small for the Free plan; a newly queued job can wait up to five
minutes before its first attempt. This is appropriate for modest scheduled work, not a high-throughput
event stream. Keep handlers idempotent and split CPU-heavy tasks into smaller jobs. Monitor dead jobs
through the operational commands. See operations.md and ADR-0015.

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
invocation. Wrangler explicitly caps this template at 10 ms, and the deployment preflight rejects
configurations that route frontend traffic through the Worker. Hyperdrive is available on Free with
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
authentication workloads can use 10–20 ms CPU, above the Free per-invocation limit. Do not weaken
password hashing to fit a quota. Before relying on password sign-in at scale, deploy to the target
Free account and inspect CPU metrics; if it consistently exceeds 10 ms, use a paid Worker plan or
move authentication/API compute to a host with an appropriate CPU budget. A template build and local
dry run can verify the bundle and bindings, but only a deployment using the target account, real
database, and secrets can verify runtime CPU and external services end to end.

## PostgreSQL versions

Fresh PostgreSQL 16/17 databases receive the UUIDv7 polyfill in migration 0001; PostgreSQL 18 uses
native UUIDv7. A database that already recorded migration 0001 will not replay it. Check the function
on an existing PG16/17 database before an upgrade; never erase the migration ledger.

Native mobile build/release workflows and signing prerequisites are described in mobile.md.
