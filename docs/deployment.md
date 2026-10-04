# Deployment

Use a deployment-owned environment and secret store. Set APP_ENV=production, APP_RELEASE,
DATABASE_DRIVER=postgres, DATABASE_URL and a strong BETTER_AUTH_SECRET. Run bun erp check,
bun erp test, apply forward-only migrations, seed base records and verify readiness. Review each
migration against the target PostgreSQL version before application.

## Bun host

apps/server/server.ts runs the Hono API. apps/web is a separate Vite build; configure its HTTPS API
origin through VITE_API_BASE_URL at build time and deploy the output to a static asset host. Run a
separate bun erp jobs:work process for durable jobs. Use PostgreSQL for API and queue state; local
PGlite files are not a production data store.

## Cloudflare Workers

wrangler.jsonc is source configuration for the Cloudflare Vite plugin. bun erp cloudflare:build
generates a Worker bundle and web assets; deploy the generated
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
