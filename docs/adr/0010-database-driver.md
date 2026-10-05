# ADR-0010 — PostgreSQL-only server persistence

**Status:** Accepted and implemented.

The server uses PostgreSQL through postgres.js in development, tests, Bun deployments and Cloudflare.
Keeping one driver makes local CLI changes visible to the running app, and prevents schema or
transaction behavior from drifting between test and production. Tests require a disposable
PostgreSQL endpoint and create a uniquely named scratch database for each run.

The server does not expose file-backed databases because its schema, locking, queue claims and
migrations use PostgreSQL features. Mobile SQLite is an independent offline store.

UUIDv7 defaults support PostgreSQL 16/17 through the migration polyfill. PostgreSQL 18 keeps its
native UUIDv7 implementation. SQLite/D1 as a server persistence dialect was rejected because it
would add a second schema and transaction model.

See docs/testing.md for the isolated PostgreSQL test runner and docs/mobile.md for local mobile storage.
