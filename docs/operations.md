# Operations

Structured JSON logs go to stdout with LOG_DRIVER=console. Daily file output is a bare-metal option.
Request logs and response envelopes share a request ID. APP_RELEASE identifies the deployed build.
Sensitive fields are redacted; see security.md and logging.md.

GET /api/v1/health checks the process. GET /api/v1/ready queries the database.
Bun startup applies numbered migrations. Cloudflare never runs DDL during a request; CI applies
migrations and seed before deploying the Worker. The migration ledger makes repeat application
idempotent. bun erp db:status reports pending work.

## Background jobs

Feature writes can enqueue a job through apps/server/platform/jobs/queue.ts. Enqueue inside the same
database transaction when both records must commit or roll back together. The PostgreSQL-backed
queue claims due jobs with a lease and SKIP LOCKED, retries failures with bounded backoff, and
retains terminal rows in dead state. This provides durable at-least-once execution, not exactly-once
side effects. A handler must be idempotent and use a stable idempotency key when calling an external
system. Payloads must be minimal and contain no credentials or unnecessary personal data.

Run a persistent Bun worker with bun erp jobs:work. bun erp jobs:run-once is suitable for one batch
or an operator check. Cloudflare uses the Worker scheduled handler every five minutes and processes
at most one job through the same database queue per tick. Add a feature handler to its jobs.ts and
register it in apps/server/features/jobs.ts. The template has no business-specific handlers. Keep
Cloudflare job handlers short enough for the Free plan's 10 ms CPU budget, and split heavier work
into follow-up jobs.

Inspect queue states with bun erp jobs:status and dead rows with bun erp jobs:dead. Requeue a
specific dead job with bun erp jobs:retry <job-id> only after reviewing its idempotency and failure
cause. Error messages are not persisted; only safe error codes and structured job identifiers are kept.

Back up PostgreSQL before migrations and test restoration in a separate database. Production state
belongs in PostgreSQL or configured object storage, not an application directory. See deployment.md.

## Mail

`ctx.mail` (apps/server/platform/mail) is the single mail entry point. Features call
`ctx.mail.send(message)` for immediate delivery or `ctx.mail.queue(message)` to store a `mail.send`
job and let the worker retry transient failures. The queue path stores the already-rendered HTML, so
the worker needs no email renderer. `to` accepts a string or `{ address, name }`; `html` is optional
when `text` is present, and a plain-text body is derived from the HTML otherwise.

Transport is selected by MAIL_DRIVER and resolved through `MailDriverRegistry`, so a project can
register its own HTTP provider without editing the core:

- `log` (default) writes a structured `mail.sent` line and sends nothing — visible, never silent.
- `smtp` sends through nodemailer using SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USERNAME/SMTP_PASSWORD.
  It needs raw sockets, so the config schema refuses it when APP_DEPLOY_TARGET=cloudflare; use `log`
  or a custom HTTP driver there.
- `memory` captures messages in-process and is the seam tests assert against.

Compose the body with `@bun-erp/email` components and `renderEmailDocument`, then pass the HTML to
the mailer; the package stays opt-in because the correct transport depends on the deployment.

## Object storage

`ctx.storage` (apps/server/platform/storage) is the helper features use to persist uploaded files
and documents. The driver is chosen by STORAGE_DRIVER through `StorageDriverRegistry`, so feature
code never branches on the runtime:

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
