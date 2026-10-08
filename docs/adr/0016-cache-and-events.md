# ADR-0016 — Cache facade and transactional events

**Status:** Accepted and implemented.

## Context

Two needs kept being solved ad hoc: remembering expensive reads (the permission join) and running
side effects after a write (mail, notifications). A per-process `Map` is wrong on Cloudflare
Workers and on multi-replica Bun, where each isolate or replica holds its own copy and an
invalidation reaches only the process that handled the write. Calling side effects inline couples a
feature to its consumers and loses them on a crash after commit.

## Decision

**Cache.** `apps/server/infra/cache` exposes one facade (`get`, `set`, `remember`, `forget`,
`namespace(...).clear()`, `prune`) over three drivers chosen by `CACHE_DRIVER`:

| Driver | Scope | Notes |
|---|---|---|
| `memory` (default) | one process | TTL map, bounded size |
| `database` | every replica and isolate | table `cache_entries` (migration `0014_cache`), expiry on the database clock, pruned by the `cache.prune` schedule |
| `cloudflare-kv` | global, eventually consistent | needs the Worker KV binding named by `CACHE_KV_BINDING`; refused on Bun |

A cached value is an optimisation: the caller can always recompute it from PostgreSQL and a miss
never changes behaviour. Values are JSON; `undefined` means "not cached". The permission cache
(`features/rbac/cache.ts`) runs on the facade, so the `database` driver makes grants and
revocations visible across replicas and isolates. It refuses `cloudflare-kv` (a revoked permission
must not survive on a stale edge copy) and `PERMISSION_CACHE_ENABLED=false` still disables it.

**Events.** `apps/server/infra/events` provides `defineEvent<T>(name)`, `defineListener(...)` and
`dispatch(tx, event, payload)`. Dispatch enqueues one `background_jobs` row per listener inside the
caller's transaction (ADR-0015), so a rolled-back write dispatches nothing and a committed write
cannot lose its side effects. Each listener is its own job with its own retries; a failing
listener never blocks its siblings. Delivery is at-least-once, so listeners are idempotent, and
`dispatch(..., { idempotencyKey })` dedupes a repeated dispatch of the same fact. Listeners are
declared per feature and collected in `features/events.ts`, which feeds both the job registry and
the dispatch side.

## Consequences

No new dependency and no broker. Database-backed cache reads cost one query, so the permission
cache on `database` saves the three-table join but not a round trip; use `memory` where per-process
staleness within the 10-second TTL is acceptable. Listener job names are `event.<event>.<listener>`
and are part of the stored queue, so renaming one while jobs are pending orphans them (they retry
as `JOB_HANDLER_NOT_REGISTERED` until the name returns). Event payloads follow the job rules: small,
JSON, no credentials.
