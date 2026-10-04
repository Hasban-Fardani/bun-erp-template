# ADR-0015 — PostgreSQL-backed background jobs

**Status:** Accepted and implemented.

## Context

Feature work must survive a process restart and work on both the Bun host and Cloudflare Workers.
Adding a Redis-compatible broker would split enqueue semantics from the database transaction and
require a second adapter for Workers. The template has no measured queue volume that justifies that
operational cost.

## Decision

Store job records in PostgreSQL and enqueue through the same database transaction as the feature
write. Workers claim one due record with FOR UPDATE SKIP LOCKED, increment an attempt counter and
set a renewable lease token. Expired leases make interrupted jobs eligible again. Retryable failures
use bounded exponential backoff; exhausted or unhandled jobs remain in dead state for inspection.

Execution is at-least-once. Handler authors own idempotency; external effects must use a stable
idempotency key. Payloads stay small and contain no credentials. Persist safe error codes, not
exception messages. Bun uses a continuous worker command; Cloudflare uses a one-minute scheduled
trigger and processes a bounded batch.

## Consequences

The queue supports atomic transactional enqueue without a broker, with PostgreSQL serving as the
shared source of truth. It is suitable for modest application workloads. Throughput, row retention
and contention must be measured before scaling; a future broker needs an explicit outbox adapter
and must preserve delivery guarantees. Dead rows need operator review before requeue.

See docs/operations.md for commands and handler registration.
