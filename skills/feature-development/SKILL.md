---
name: feature-development
description: Use when adding or changing a server feature under apps/server/features.
---

# Feature development

Read docs/architecture.md and docs/api-contract.md.
Install the reference module with `bun erp features:install departments` (catalog:
templates/features) or scaffold a new one with `bun erp make:feature <name>`; preserve the same
boundaries.

1. Define raw Zod input schemas in validation.ts and compile once at feature scope.
2. Define Drizzle tables in schema.ts and add a forward-only numbered TypeScript migration.
3. Implement service operations and transactions; record audit evidence for state changes.
4. Define authorization policy; no policy means deny, not public access.
5. Keep route chains typed: authorize, validate middleware, service, typed response.
6. Required files: route.ts, validation.ts, service.ts, policy.ts, and schema.ts when the feature
   owns a table. Optional: api/components/hooks/providers/stores/types, only when the feature needs
   them. Do not create empty folders or a feature README.
7. Register feature-owned jobs through jobs.ts and apps/server/features/jobs.ts. Enqueue in the same
   transaction as the corresponding feature write.
8. Add route, service and migration tests. Keep feature tests under apps/server/tests/features/<feature>.
9. Run bun erp check and bun erp test; report the actual results.

Organization scope comes from server context. Use rowsOf() for driver-neutral raw query results.
Unauthorized is 401; missing permission is 403; missing organization-scoped rows are 404.
