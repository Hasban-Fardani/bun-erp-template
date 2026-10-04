# ADR-0002 — Valkey queue direction

**Status:** Superseded by ADR-0015.

The original VPS direction selected Valkey's Redis-compatible protocol and rejected Redis-only
features. It was not implemented. The template now uses a PostgreSQL-backed durable jobs table to
share transactional enqueue behavior between Bun and Cloudflare Workers. Keep this record as the
history of the rejected deployment-specific direction; use ADR-0015 and docs/operations.md for the
active queue contract.
