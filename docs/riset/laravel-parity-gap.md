# Laravel parity gaps

Where this template stands against Laravel's batteries-included framework, and which gaps
actually matter for an ERP. Historical observation, not active agent instructions: capabilities
here change as features land, so re-verify against the source before acting on a row.

Scope: `apps/server` (Hono, Drizzle, PostgreSQL, database jobs) plus `packages/*`. Compared
against Laravel 11/12 core, not the wider ecosystem (Nova, Cashier, etc.) except where noted.

## Already at parity (or stronger)

Routing, middleware, `/api/v1` versioning, and the error contract; ORM (Drizzle ~ Eloquent query
builder); forward-only migrations; seeders (`db:seed`, `make:seeder`); authentication through
better-auth (sessions, email/password, dormant Google OAuth); authorization through RBAC permission
keys with a permission cache; validation with zod; i18n; structured logging; OpenAPI; an
Artisan-like CLI (`cli/`); the Bun test harness plus Playwright browser QA.

Platform services landed as "P0" are at parity: Mail (`log`/`smtp`/`memory` drivers, queue or
sync), object storage (`local`/`s3`/`r2`/`memory`, S3 presign, multi-platform package), database
notifications (database + mail channels), and durable database jobs (retry, backoff, `maxAttempts`,
dead-letter, delayed `runAt`, `idempotencyKey`, lease).

## Gaps

| Area | Laravel | This repo | ERP impact |
|---|---|---|---|
| Scheduler / cron | `schedule()` | missing | Due-date reminders, monthly invoices, nightly sync, audit purge cannot run on a timer |
| Events & listeners | `Event::dispatch` | missing (audit is called manually) | Side effects stay coupled inside services |
| General cache store | `Cache::remember`, tags, drivers | permission cache only | Heavy reports and dashboards cannot be cached |
| Soft deletes | `SoftDeletes` | missing | Hard deletes on master data are irreversible; no restore |
| Model factories | `Factory` | missing (hand-written fixtures) | Slow to build test data at scale |
| API resources | `JsonResource` | manual shaping per feature | Response shapes can drift between modules |
| Rate limiting | `throttle` / `RateLimiter` | missing | Login and public endpoints have no brute-force protection |
| Outbound HTTP client | `Http::retry()` | missing | Third-party integrations use raw `fetch` without retry/timeout |
| Job batching / chaining | `Bus::batch` / `chain` | single jobs only | Bulk import of thousands of rows has no progress or cancel |
| Queue / request inspector | Horizon, Telescope | `jobs:*` CLI only | No UI for requests, queries, or exceptions |
| Feature flags | Pennant | one env flag (`FEATURE_ADVANCED_REPORTS`) | No per-user or gradual rollout |
| Broadcasting / WebSocket | Echo, Reverb | missing | Real-time views must poll |
| Full-text search | Scout | missing | Search over large master data is slow |
| Per-record policies | `Policy` | RBAC permission keys only | No row-level rule (`update(user, post)`) |
| Multipart upload | `Storage::putFile` | storage exists, no upload handler | Large uploads are unhandled |
| Signed / temporary URLs | `temporaryUrl` | S3 presign; R2 needs a public URL | Not uniform across drivers |
| Migration rollback | `migrate:rollback` | forward-only by design | Different philosophy, not a defect |

Deliberately out of scope: Blade, Livewire, Inertia, and Mix (React + Vite replace them);
Sanctum and Passport (better-auth replaces them); Cashier (no billing in a template).

## Suggested order

1. Scheduler — largest gap; jobs exist, only the timer is missing.
2. Events and listeners — a small dispatcher in `@bun-erp/utils` plus a listener registry, then
   move audit and notifications onto it.
3. Cache store — a `ctx.cache` abstraction (memory/postgres) with `remember()` and invalidation;
   the permission cache moves onto it.
4. Soft deletes — a `deletedAt` column, a default filter, and a restore command.
5. Rate limiting — a `throttle` middleware on login and public endpoints.
6. Factories — a test-data generator (`make:factory`) beside the seeders.

## Related finding: `packages/email`

Email *sending* is not in `packages/email`; it lives in `apps/server/platform/mail` (the transport,
including the nodemailer SMTP driver). `packages/email` only composes HTML via
`renderEmailDocument` and holds React email components, and nothing imports it yet. That split is
why the package can look unused.

## Method

Inventory taken from the current tree: `apps/server/platform`, `apps/server/features`,
`apps/server/http`, `cli/` command list, `packages/*`, and the config schema. Statuses reflect
grep plus source reading, not a formal audit.
