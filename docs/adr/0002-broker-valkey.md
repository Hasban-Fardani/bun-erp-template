# ADR-0002 — Valkey for VPS queues

**Status:** Accepted direction; not implemented.

Use Valkey's Redis-compatible protocol when VPS queue/cache work is required. Redis-only was
rejected. Do not add a broker dependency or REDIS_URL before a concrete feature needs it.
Workers require another queue adapter; see [ADR-0011](0011-deployment-hybrid.md).
