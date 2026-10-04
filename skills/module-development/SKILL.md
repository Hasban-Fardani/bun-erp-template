---
name: module-development
description: Use when adding or changing a module under apps/server/modules.
---

# Module development

Read [architecture](../../docs/architecture.md) and [API contract](../../docs/api-contract.md).
Copy departments; keep schema/data/service/policy/route boundaries.

1. Define raw Zod schema and compile once at module scope.
2. Define Drizzle tables and forward-only numbered migration.
3. Implement service transaction and audit where state changes.
4. Define authorization; no policy means deny, not public access.
5. Chain typed Hono routes: authorize → validate middleware → service → typed ok().
6. Register routes without erasing inferred RPC types; update OpenAPI and HTTP tests.

Organization comes from server context. Use rowsOf() for driver-neutral raw query results.
Unique conflicts are 409; absent organization-scoped rows are 404.
