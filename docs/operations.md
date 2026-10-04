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
