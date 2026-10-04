# ADR-0003 — UUIDv7

**Status:** Accepted; partially implemented.

PostgreSQL uuid keys use UUIDv7 defaults for time-oriented indexes. ULID, UUIDv4 and serial
keys were rejected. PG16/17 fresh migrations install a polyfill; PG18 uses native UUIDv7.

The selected ownership is database generation. Better Auth currently overrides IDs with
Bun.randomUUIDv7(); removing that override is pending verification/decision, not completed work.
See [deployment](../deployment.md) before moving an already-migrated database.
