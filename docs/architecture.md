# Architecture

## Current structure

- `apps/server/server.ts`: Bun entry, context, migrations and infrastructure seed.
- `apps/server/http`: Hono middleware, routes, validation, typed envelopes and OpenAPI.
- `apps/server/modules/{identity,rbac,audit,departments}`: schema, data, service, policy, route.
- `apps/server/platform`: config, database drivers and logging.
- `apps/server/migrations`: one sequence of forward-only PostgreSQL SQL files.
- `apps/web`: React + Vite, Hono RPC and TanStack Query/Router.
- `apps/mobile`: Capacitor configuration and native packaging of the same web source.
- `tools`: read-only checks; `scripts`: setup, build and QA orchestration.

Request: middleware → authorize → validate → service transaction → JSON envelope.
Use [API contract](api-contract.md) for exceptions and status codes.
Routes return typed Hono chains; server code reaches web only through type imports.

Configuration is parsed in `platform/config`; organization is resolved on the server.
Cross-module access uses public services. New domain modules follow departments.

## Selected but not implemented

File-based routing/loaders, a Cloudflare API Worker, background queues and agent runtime
are not present. Current Router uses `routes/route-tree.tsx`; auth guards are still components
and table URL state still uses `use-table-state.ts`. See the [ADR index](adr/README.md).
The API serves HTTP, not web assets. Native packaging is not proof of native login support.
