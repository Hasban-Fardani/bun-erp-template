# ADR-0010 — One PostgreSQL dialect

**Status:** Accepted and implemented.

The server schema uses one PostgreSQL dialect. PGlite is the local/test driver; postgres.js is used
for production PostgreSQL. DATABASE_PATH names local database files without tying the path to a
specific driver. The server does not expose SQLite as a database driver because its schema, locking
and migrations use PostgreSQL features. Mobile SQLite is an independent offline store.

UUIDv7 defaults support PostgreSQL 16/17 through the migration polyfill. PostgreSQL 18 keeps its
native UUIDv7 implementation. SQLite/D1 as a server persistence dialect was rejected because it
would add a second schema and transaction model.

See docs/testing.md for the PostgreSQL test runner and docs/mobile.md for local mobile storage.
