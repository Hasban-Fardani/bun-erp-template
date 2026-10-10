---
name: background-jobs
description: Use when a feature needs work that should execute outside the HTTP request, including scheduled work, retries, or transactional outbox delivery.
---

# Durable background jobs

1. Read `docs/operations.md` and [ADR-0015](../../docs/adr/0015-postgres-background-jobs.md) before changing the queue.
2. Enqueue through `enqueueJob` in the same database transaction as the feature write. Supply a stable idempotency key when retries could repeat an external effect.
3. Register handlers in the feature's `jobs.ts` and add that registration to `apps/server/features/jobs.ts`. Handlers must be idempotent and safe to execute more than once.
4. Keep payloads minimal and avoid credentials or personal data. Persist only safe error codes; use structured logs with job ID, name and attempt count.
5. Add tests for enqueue deduplication, success, retry and terminal failure. Run `bun loom check`, `bun loom test`, and `bun loom check:prod` for production-facing queue changes.
