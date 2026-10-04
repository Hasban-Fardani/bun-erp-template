# ADR-0010 — One PostgreSQL dialect

**Status:** Accepted; implemented.

PGlite serves local/test development and postgres.js production. Modules share the Database
type and SQL migrations. SQLite/D1 was rejected because it adds another schema/transaction model.
UUIDv7 bootstrap supports fresh PG16/17; PG18 keeps native defaults.

The workflow defines PGlite and PG16/18 runs; actual success belongs to a particular CI run.
[Testing](../testing.md) explains the isolated PostgreSQL runner and fixture lifecycle.
