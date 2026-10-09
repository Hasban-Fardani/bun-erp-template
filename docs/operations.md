# Operations

Structured JSON logs go to stdout with LOG_DRIVER=console. Daily file output with rotation is a
bare-metal option (see "Log rotation").
Request logs and response envelopes share a request ID. APP_RELEASE identifies the deployed build.
Sensitive fields are redacted; see security.md and the logging section below.

GET /api/v1/health checks the process. GET /api/v1/ready queries the database.
Bun startup applies numbered migrations. Cloudflare never runs DDL during a request; CI applies
migrations and seed before deploying the Worker. The migration ledger makes repeat application
idempotent. bun erp db:status reports pending work.

## Logging

Each record is one JSON object with a timestamp, level, service/area, release, event name and
useful identifiers. Server HTTP failures include the Hono request ID, method, route, status and
duration. Mobile requests send an `X-Request-Id`; the response envelope returns the same ID.

Log events describe state transitions and failures, not full request bodies. Passwords, tokens,
cookies, authorization headers, personal identifiers and user-entered values stay out of logs.
Server Pino redaction and the mobile logger enforce common sensitive-key rules. Worker logs use
the same structured shape and go to Cloudflare's console sink.

Use stable event names such as `http.request.slow_or_failed` and attach low-risk fields such as
`requestId`, `method`, `path`, `status`, `duration_ms` and release. Route paths must not contain
record values; use the registered route template if one is available. Keep success logs quiet,
and log an error once at the boundary that can act on it. Never log a secret to explain a failure.

Mobile code calls `createMobileLogger(area)` from `apps/mobile/src/lib/logger.ts` (install the catalog
app with `bun erp apps:create <name> mobile` first). The mobile
gate blocks direct `console` calls elsewhere. Debug events are disabled in production builds.

## Log rotation

`LOG_DRIVER=daily` (VPS only; Workers log to the platform console) writes to `LOG_PATH`, which must
be absolute. The file name carries the UTC day: `LOG_PATH=/var/log/erp/app.log` produces
`app-2026-10-08.log`. Two settings control it:

| Variable | Effect |
|---|---|
| `LOG_MAX_SIZE_MB` | A file that would pass this size is renamed `app-2026-10-08.1.log`, `.2.log`, ... and a fresh `app-2026-10-08.log` starts. |
| `LOG_RETENTION_DAYS` | Files whose day is older than this many days (today counts as day one) are deleted when a new day starts and at boot. Only files matching `<stem>-YYYY-MM-DD[.n]<ext>` are touched. |

Lines are buffered for one event-loop turn and flushed on a normal exit. A failing disk never stops
the request path; it loses log lines instead. On a host that already ships stdout (Docker,
systemd-journald), prefer `LOG_DRIVER=console` and let the platform rotate.

## API rate limiting

`/api/v1/*` is limited per caller with a fixed window stored in PostgreSQL (`api_rate_limits`, one
`INSERT ... ON CONFLICT ... RETURNING` per request), so every Bun replica and Cloudflare isolate
shares one budget. A signed-in session is keyed by user id; everything else by client address.

| Variable | Default | Meaning |
|---|---|---|
| `API_RATE_LIMIT_ENABLED` | `true` | Master switch. |
| `API_RATE_LIMIT_MAX` | `300` | Requests allowed per caller per window. |
| `API_RATE_LIMIT_WINDOW_SECONDS` | `60` | Window length. |
| `IMPERSONATION_ENABLED` | `true` | `false` disables user impersonation (docs/security.md). |
| `IMPERSONATION_TTL_MINUTES` | `60` | Maximum length of an impersonation session. |

The request after the limit gets `429`, error code `RATE_LIMITED` and a `Retry-After` header in
seconds. `/api/v1/health`, `/api/v1/ready` and `/api/v1/auth/*` are not counted here: probes must
never be throttled, and Better Auth applies its own stricter rules to the auth endpoints
(`AUTH_RATE_LIMIT_ENABLED`).

The client address is read from `X-Forwarded-For` only when `TRUST_PROXY=true`, the same rule Better
Auth uses. Without it all anonymous callers share one `ip:unknown` bucket, which cannot starve
signed-in users because they have their own user-id buckets. Set `TRUST_PROXY=true` behind a proxy
that overwrites the header (Cloudflare, nginx, Caddy). Counter rows are one per caller and are
overwritten in place, so the table does not grow with time.

## Data retention

The `retention.prune` schedule runs hourly (`17 * * * *`) and issues one bounded
`DELETE ... LIMIT` per table, so a run stays far inside the cron CPU budget and a backlog drains
over several runs. It is idempotent and safe to run on several replicas at once.

| Table | Removed when | Variable (default) |
|---|---|---|
| `session`, `verification` | `expires_at` is past | none |
| `rate_limit` (Better Auth) | last request older than one day | none |
| `api_rate_limits` | window older than two days (keeps the daily AI quota) | none |
| `background_jobs` | `completed` or `dead` and older than N days | `RETENTION_JOBS_DAYS` (14) |
| `notifications` | read and older than N days; unread stay | `RETENTION_NOTIFICATIONS_DAYS` (90) |
| `ai_messages` | older than N days | `RETENTION_AI_MESSAGES_DAYS` (90) |

`RETENTION_BATCH_SIZE` (500, 10-5000) caps rows per table per run. Hourly rather than every few
minutes on purpose: on Workers Free, Hyperdrive allows 100,000 queries a day, and the pruner costs
about 7 a run (168 a day). The run logs `retention.pruned` with the counts. `cache.prune` stays
separate and only exists with `CACHE_DRIVER=database`.

## Query budget

Every SQL statement costs a database round trip, and on Cloudflare Workers Free it also spends Hyperdrive's
100,000 queries/day. A route's statement count is therefore a reviewed number, not a guess.

- **Where:** `http/query-budget.ts` lists `METHOD /route` → maximum statements; routes without an entry
  must stay under `DEFAULT_QUERY_BUDGET`. Add the entry when you add a route.
- **In tests:** `tests/features/http/query-budget.test.ts` rebuilds the app per call (as the Worker does),
  warms module caches, then fails with the statement text when a route exceeds its budget. Use
  `countQueries(fn)` from `tests/support/query-budget.ts` to inspect any code path.
- **In development:** responses carry `Server-Timing: db;desc="N queries"`; read it in the browser devtools.
- **In production:** nothing is exposed. A request over budget logs one `http.query_budget_exceeded` warning
  (route, count, budget; never SQL text). Search it in Workers Logs; it stays far below the 200k events/day cap.
- **Mechanism:** `ctx.queries` (`infra/observability/query-meter.ts`) is fed by the postgres.js `debug` hook, so
  Drizzle, Better Auth's adapter and raw `sql` are all counted. On a long-lived Bun process concurrent
  requests share one counter, so a per-request count there is an upper bound; on Workers it is exact.
- **Not covered:** the daily total. Read Hyperdrive usage in the Cloudflare dashboard.
- **Do not cut:** security-relevant queries (session and user lookups) are not traded for budget; reduce
  business queries instead.

## Workers Logs

`wrangler.jsonc` sets `observability.enabled`, so Worker `console` output (our structured JSON logs)
is searchable under Workers & Pages -> the Worker -> Logs. Keep `LOG_LEVEL=info`; the platform
retention and volume limits of your plan apply.

## Backup and restore

`bun erp db:backup [--out <file>] [--force]` runs `pg_dump --format=custom` against `DATABASE_URL`
and writes `.data/backups/<timestamp>.dump` by default. It needs the PostgreSQL client (`pg_dump`,
major version at least the server's). The connection is passed through `PG*` environment variables
so the password is never in the process list or the output. With `APP_ENV=production` it never
overwrites an existing file; elsewhere it refuses unless `--force`.

`.github/workflows/db-backup.yml` runs daily and on demand. Secrets: `BACKUP_DATABASE_URL` (a
read-only role pointing at the origin database, not Hyperdrive; falls back to `DATABASE_URL`).
With the repository variable `R2_BACKUP_BUCKET` plus secrets `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` and `CLOUDFLARE_ACCOUNT_ID` the dump goes to that private R2 bucket
(`db/`); otherwise it is kept as a 14-day workflow artifact, which anyone with repository read
access can download, so use R2 for real data. Configure an R2 lifecycle rule for retention.

Restore runbook (practice it on a scratch database before you need it):

1. Create an empty database and note its URL as `RESTORE_URL`.
2. `pg_restore --list backup.dump | head` to confirm the file is readable.
3. `pg_restore --no-owner --no-privileges --clean --if-exists -d "$RESTORE_URL" backup.dump`.
4. Point `DATABASE_URL` at it and run `bun erp db:status` (expect zero pending) and check `/api/v1/ready`.
5. Cut over (Hyperdrive origin or `DATABASE_URL`) and verify sign-in. Objects in R2/S3 are not part of the dump.

## Maintenance mode

```sh
bun erp down --message "Back at 10:00"   # API answers 503 with that message
bun erp up                               # resume
```

The switch is a row in `app_state` (key `maintenance`), so it applies to every replica and to
Cloudflare. Each process reads the row through a 2 second cache; a change reaches all of them within
a few seconds. While it is on, `/api/v1/*` answers `503 SERVICE_UNAVAILABLE` with the message and a
`Retry-After: 30` header, except:

- `GET /api/v1/health` and `GET /api/v1/ready` (orchestrators must keep seeing a live process);
- `/api/v1/auth/*`, so an operator can still sign in;
- sessions holding `app.maintenance_bypass`, which the `owner` role has. Use it to verify a release
  before reopening. The key is `app.maintenance_bypass` rather than `app.maintenance.bypass`
  because permission keys are `<resource>.<action>` and split on the first dot.

Both commands write an audit entry (`app.maintenance_enabled` / `app.maintenance_disabled`). The web
app is not blocked; it receives 503 envelopes from the API.

## Cross-site request protection

Browser sessions use cookies, so a write must not be triggerable from another site. Unsafe methods
(`POST`, `PUT`, `PATCH`, `DELETE`) on `/api/v1/*` that carry an `Origin` header must come from the
request's own origin, from `APP_URL`, or from `AUTH_TRUSTED_ORIGINS` (the list CORS uses); anything
else is `403`. A request without `Origin` is a non-browser client (CLI, server to server) and passes,
unless the browser marked it `Sec-Fetch-Site: cross-site`. Browsers always send `Origin` on
cross-origin writes, which is why the header check is sufficient. Mobile (Capacitor) origins must be
in `AUTH_TRUSTED_ORIGINS`, as they already must be for CORS.

`/api/v1/auth/*` is handled by Better Auth, which validates `Origin`/`Referer` and callback URLs
against `baseURL` and `AUTH_TRUSTED_ORIGINS` itself. Better Auth skips that check when `NODE_ENV=test`, so the
test suite cannot prove it; the business-API check is covered by `tests/features/http/csrf.test.ts`.

## Database TLS

`DATABASE_SSL_MODE` is passed to postgres.js as its `ssl` option:

| Mode | Behaviour |
|---|---|
| `disable` | No TLS (`ssl: false`). Refused in production on the Bun target. |
| `require` | TLS is mandatory; the server certificate is not verified. |
| `verify-full` | TLS with certificate and host name verification (`rejectUnauthorized: true`). Use it for any database outside a private network. |

A `sslmode=` already in `DATABASE_URL` wins over `DATABASE_SSL_MODE`; when the two disagree a
`database.ssl_mode_mismatch` warning is logged once per process so the override is never silent.

On Cloudflare the Worker connects to the Hyperdrive binding, and Hyperdrive owns TLS to the origin
database. `DATABASE_SSL_MODE` is therefore not applied to that socket (the schema allows `disable`
there). Configure origin TLS on the Hyperdrive configuration instead.

## Background jobs

Feature writes can enqueue a job through apps/server/infra/jobs/queue.ts. Enqueue inside the same
database transaction when both records must commit or roll back together. The PostgreSQL-backed
queue claims due jobs with a lease and SKIP LOCKED, retries failures with bounded backoff, and
retains terminal rows in dead state. This provides durable at-least-once execution, not exactly-once
side effects. A handler must be idempotent and use a stable idempotency key when calling an external
system. Payloads must be minimal and contain no credentials or unnecessary personal data.

Run a persistent Bun worker with bun erp jobs:work. bun erp jobs:run-once is suitable for one batch
or an operator check. Cloudflare uses the Worker scheduled handler every five minutes and processes
jobs through the same database queue per tick: up to 10 jobs, stopping once a 10-second wall-clock budget has passed (the job in flight finishes). Add a feature handler to its jobs.ts and
register it in apps/server/features/jobs.ts. The template has no business-specific handlers. Keep
Cloudflare job handlers short enough for the Worker's CPU limit (10 ms on Free; the shipped `limits.cpu_ms` on Paid, see deployment.md), and split heavier work
into follow-up jobs.

Inspect queue states with bun erp jobs:status and dead rows with bun erp jobs:dead. Requeue a
specific dead job with bun erp jobs:retry <job-id> only after reviewing its idempotency and failure
cause. Error messages are not persisted; only safe error codes and structured job identifiers are kept.

Back up PostgreSQL before migrations and test restoration in a separate database. Production state
belongs in PostgreSQL or configured object storage, not an application directory. See deployment.md.

## Mail

The default server ships no mail transport; `notify()` delivers through the database channel only.
Install mail when the deployment needs it:

```
bun erp features:install mail
```

That command installs the `@bun-erp/mail` catalog package and wires `ctx.mail`, the `mail.send` job
and the notifications `mail` channel into the composition root. After that, features call
`ctx.mail.send(message)` for immediate delivery or `ctx.mail.queue(message)` to store a `mail.send`
job and let the worker retry transient failures. The queue path stores the already-rendered HTML, so
the worker needs no email renderer. `to` accepts a string or `{ address, name }`; `html` is optional
when `text` is present, and a plain-text body is derived from the HTML otherwise.

Transport is selected by MAIL_DRIVER and resolved through `MailDriverRegistry`, so a project can
register its own HTTP provider without editing the package:

- `log` (default) writes a structured `mail.sent` line and sends nothing — visible, never silent.
- `smtp` sends through nodemailer using SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USERNAME/SMTP_PASSWORD.
  It needs raw sockets, so the config schema refuses it when APP_DEPLOY_TARGET=cloudflare; use `http`
  or `log` there.
- `http` posts to the Resend API over `fetch` (MAIL_HTTP_PROVIDER=resend, MAIL_API_KEY), so it works
  on Bun and Cloudflare Workers. The sender comes from MAIL_FROM_ADDRESS and MAIL_FROM_NAME. A provider
  error throws a coded, retryable-flagged error (`MAIL_HTTP_<status>`, `MAIL_HTTP_NETWORK`) that never
  contains the key; the queue retries it and the idempotency key is forwarded to the provider.
- `memory` captures messages in-process and is the seam tests assert against.

Compose the body with `@bun-erp/email` components and `renderEmailDocument` (install the package with
`bun erp packages:install email`), then pass the HTML to the mailer; the package stays opt-in because
the correct transport depends on the deployment. The `MAIL_*` and `SMTP_*` config keys live in the
core schema, so one validated environment serves both install states.

### Switching mail drivers

Switching is configuration only: no code change and no migration. Resend (`http`) to SMTP, and back:

1. Set the env: `MAIL_DRIVER=smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`,
   `SMTP_PASSWORD`; or `MAIL_DRIVER=http` with `MAIL_HTTP_PROVIDER=resend` and `MAIL_API_KEY`.
2. Restart the app and the `jobs:work` worker. Both read the driver once at startup.
3. Run `bun erp mail:test --to <your address>`. It sends one plain message synchronously through the
   configured driver (not the queue), prints the driver name and message id, and exits non-zero with the
   error message on failure. For SMTP it first runs nodemailer `verify()`, which checks the connection and
   login without sending.
4. Queued `mail.send` jobs keep working across the switch: the payload is pre-rendered and names no
   driver, so the worker delivers pending jobs through whichever driver is configured when it runs them.
5. Update SPF, DKIM and DMARC for the sender domain to authorize the new provider before real traffic
   (`MAIL_FROM_ADDRESS` must sit on a domain the new provider may send for).

Caveats:

- SMTP is VPS-only. Cloudflare Workers have no raw sockets, so the config schema refuses
  `MAIL_DRIVER=smtp` when `APP_DEPLOY_TARGET=cloudflare`; use `http` there.
- A driver error carrying `retryable: false` (SMTP 535 login, any 5xx reply or bad envelope; Resend 4xx
  other than 408 and 429) dead-letters the job on the first attempt instead of retrying five times; fix
  the cause, then `bun erp jobs:retry <id>`. Network errors, SMTP 4xx and Resend 5xx and 429 still retry.
- Jobs are at-least-once. Resend deduplicates a re-send by its `Idempotency-Key`; SMTP has no such
  header. If the worker crashes between the SMTP send and marking the job complete, the retry can deliver
  the message twice. The SMTP driver sets a stable `Message-ID` derived from the job so the duplicate is
  recognizable in logs and some clients, but it is not deduplicated by the server.

## Object storage

Storage lives in one package, `@bun-erp/storage`, with a subpath per platform so imports stay
explicit and a bundler never pulls the wrong runtime:

- `@bun-erp/storage/server` — object store for Bun and Cloudflare. `apps/server/infra/storage.ts`
  maps the validated environment onto `ServerStorageConfig` and exposes `ctx.storage`.
- `@bun-erp/storage` — the runtime-neutral browser/mobile key/value store.
- `@bun-erp/storage/ui` — IndexedDB and Web Storage adapters plus the default browser resolver.
- `@bun-erp/storage/capacitor` — encrypted SQLite through `@capacitor-community/sqlite`.

The server driver is chosen by STORAGE_DRIVER through `StorageDriverRegistry`, so feature code never
branches on the runtime:

- `local` writes under STORAGE_LOCAL_ROOT through the Bun filesystem. Development and test only;
  the config schema refuses it when APP_ENV=production.
- `s3` uses `Bun.S3Client` (no AWS SDK). S3_BUCKET is required; S3_REGION, S3_ENDPOINT,
  S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_FORCE_PATH_STYLE configure the client.
- `r2` uses a Cloudflare Worker binding named by STORAGE_R2_BINDING. R2 bindings cannot presign, so
  STORAGE_PUBLIC_URL is required; the Worker example in wrangler.jsonc selects this driver.
- `memory` keeps objects in-process for tests and driver-agnostic boots.

The driver name is validated at bootstrap, but the transport is built on first use: a filesystem,
S3 client, and Worker binding cannot all be constructed on every runtime, so an unused driver never
crashes startup. `put`, `get`, `delete`, `exists` and `url` are the surface; `putJson`/`getJson` wrap
JSON. Keys are normalized and reject traversal before any driver touches a path or bucket. Use
`url(key, { expiresInSeconds })` for a presigned link when the driver supports it.

On the client, `createKeyValueStore(adapter)` stores namespaced JSON records, and
`getDefaultKeyValueStore()` picks the backend: native SQLite when the mobile app injects
`createCapacitorSqliteAdapter`, IndexedDB in a browser, then Web Storage, then memory.

## Notifications

`apps/server/features/notifications` delivers in-app and email notifications through a channel
registry (`NotificationChannelRegistry`, built on the shared `DriverRegistry`). Call `notify()` from
a service after the owning write commits — or inside the transaction when the notification must be
atomic with it:

```ts
await notify(ctx, {
  recipients: [userId],
  type: "department.created",
  title: "Department created",
  body: "A new department is available.",
  via: ["database", "mail"],
});
```

- `database` (default) writes one `notifications` row per recipient: the in-app inbox.
- `mail` exists only after `bun erp features:install mail`; it looks up each recipient's email and
  sends through `ctx.mail.queue`, so delivery is retried by the worker. Register a webhook or push
  channel by adding a factory to `createNotificationRegistry`.

The API is self-scoped (`requireActor`, no permission key): `GET /api/v1/notifications`,
`GET /api/v1/notifications/unread-count`, `POST /api/v1/notifications/:id/read`, and
`POST /api/v1/notifications/read-all` all operate on the signed-in user only. A web or mobile inbox
screen is a thin client over these routes.
