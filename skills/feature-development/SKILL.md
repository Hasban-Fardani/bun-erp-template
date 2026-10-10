---
name: feature-development
description: Use when adding or changing a server feature under apps/server/features.
---

# Feature development

Read docs/architecture.md and docs/api-contract.md.
Install the reference module with `bun loom features:install departments` (catalog:
templates/features) or scaffold a new one with `bun loom make:feature <name>`; preserve the same
boundaries. `make:feature` plans every file and wiring edit before it writes: a missing `// @loom:`
marker in a core file aborts the command with zero files written, so restore the marker instead of
wiring by hand. Generated output lives in `templates/generators/feature/*.tmpl` — edit the template,
never a generated copy. `make:feature` emits optimistic locking by default (`--no-version` opts out)
and soft delete only with `--soft-delete`: soft delete is for master data that history references,
never for append-only or high-volume tables (logs, events, jobs, notifications, sessions, join tables).

1. Define raw Zod input schemas in validation.ts and compile once at feature scope.
2. Define Drizzle tables in schema.ts and add a forward-only numbered TypeScript migration.
3. Implement service operations and transactions; record audit evidence for state changes.
4. Define authorization policy; no policy means deny, not public access.
5. Keep route chains typed: authorize, validate middleware (use the shared `idParam` schema for
   `:id` params so a malformed uuid is a 422, not a database 500), service, typed response.
6. Required files: route.ts, validation.ts, service.ts, policy.ts, and schema.ts when the feature
   owns a table. Optional: api/components/hooks/providers/stores/types, only when the feature needs
   them. Do not create empty folders or a feature README.
7. Register feature-owned jobs through jobs.ts and apps/server/features/jobs.ts. Enqueue in the same
   transaction as the corresponding feature write.
8. Add route, service and migration tests. Keep feature tests under apps/server/tests/features/<feature>.
9. Run `bun loom db:migrate`, then `bun loom test --filter <feature>`, then bun loom check; report the
   actual results.

The actor comes from the session, never from input. The default server is tenant-free; organizations
are the opt-in `organizations` feature. Use rowsOf() for driver-neutral raw query results.
Unauthorized is 401; missing permission is 403; a missing row is 404.
