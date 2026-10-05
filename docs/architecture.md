# Architecture and file map

Start at the owner of the change below. Feature internals are optional: add api, components, hooks,
providers, stores or types only when that feature needs them. Do not create empty folders to satisfy
a convention.

| Change | Start here | Ownership |
|---|---|---|
| Run web + API on Bun | apps/server/server.ts | Production listener and request dispatch |
| Build application dependencies | apps/server/bootstrap.ts | Environment, database, migrations, logger and auth |
| Compose HTTP behavior | apps/server/http/app.ts | Middleware, version prefix, feature routes, docs and error envelope |
| Add an API feature | apps/server/features/<name> | route.ts, validation.ts, service.ts, policy.ts, schema.ts; optional jobs.ts |
| Add a migration | apps/server/migrations/NNNN_name.ts | Forward-only TypeScript migration exporting up(database) |
| Add shared runtime services | apps/server/platform | Config, database, logging and durable jobs |
| Add a web URL | apps/web/src/pages | Small TanStack file route wrappers; route tree is generated |
| Implement a web screen | apps/web/src/features/<name>/screens | Screen composition; feature API, hooks, components and types stay nearby |
| Start or add mobile screens | apps/mobile/src/main.tsx, apps/mobile/src/pages | Separate React entry and mobile-only composition |
| Store offline mobile data | apps/mobile/src/features/offline/stores/offline-store.ts | Encrypted native SQLite / browser IndexedDB adapter |
| Change shared presentation | packages/ui/src | Atomic layers, tokens and approved upstream component references |
| Add cross-app pure logic | packages/utils/src | Runtime-neutral code used by at least two app workspaces |
| Change a quality gate | tools, erp.ts | Read-only checks and CLI orchestration |
| Localize shared app copy and formats | packages/i18n | Typed catalogs, locale resolution and React provider |
| Add rich text editing UI | packages/editor | Lazy React entry, composable Lexical UI and JSON value |
| Compose email or PDF documents | packages/email, packages/pdf | Opt-in rendering components with separate runtime boundaries |

## Runtime modes

Hono's `fetch` contract lets the HTTP application run behind different host adapters; it does not
make every application dependency runtime-neutral. This template currently implements and tests
two targets: Bun (`apps/server/server.ts`) and Cloudflare Workers (`apps/server/worker.ts`). The
bootstrap, CLI, migrations and local tooling use Bun APIs, so Node, Deno and Google Cloud Functions
are not selectable targets yet. Each additional target needs its own entrypoint, platform services,
build/deploy flow and CI coverage before it can be advertised as supported.

`bun dev` starts Vite with HMR and an internal API-only Bun process. Vite provides the browser
origin and proxies `/api/*` to Hono. That API process also polls the durable queue using the same
database connection. Production Bun uses `bun erp build` followed by `bun start`: one Hono listener
dispatches `/api/*` to the API and serves `apps/web/dist` for web routes. Startup checks the web
build before opening the database. `bun erp server:api` preserves API-only hosting for a separately
deployed frontend or an upstream reverse proxy.

Cloudflare uses the same API path boundary in one Worker deployment. Workers Static Assets serves
the Vite build directly; only `/api` and `/api/*` invoke Worker code. This keeps static requests
outside the Worker request quota. See [deployment](deployment.md) for host and asset details.

`APP_DEPLOY_TARGET` selects an implemented build profile (`bun` or `cloudflare`), and `APP_WEB_MODE`
selects `integrated` or `separate` hosting. `bun erp build` dispatches to the selected target; the
explicit `cloudflare:*` commands remain available. Bun can run API-only for a separately hosted web
build; Cloudflare currently requires integrated Workers Static Assets. Invalid target/mode pairs
fail validation. These settings select existing adapters; they do not turn Bun-specific imports
into Node, Deno or Google Functions support. Those targets need actual entrypoints and CI coverage
before they can be added to the allowed values.

## Backend request flow

server.ts creates the runtime context through bootstrap.ts, then http/app.ts mounts versioned
feature route trees under /api/v1. Request middleware sets the correlation ID and structured
logging context. A feature route authorizes, validates input, and calls its service. The service
owns domain operations, transactions and audit writes; schema.ts declares Drizzle tables. The
HTTP layer returns { data, meta: { requestId } }; errors return
{ error: { code, message, fields? }, meta }.

Features communicate through public service functions. Do not reach into another feature's tables
as an untracked shortcut. The Hono route tree is also the source of the Hono RPC type and generated
OpenAPI document. Cloudflare serves Workers Assets from the Worker entry and sends /api/* through
the same Hono app.

Route files register typed handlers directly on the Hono chain and compose feature routers with
app.route(). This preserves path and RPC inference; generic controller functions can erase it.
Follow [Hono's larger-application and RPC guidance](https://hono.dev/docs/guides/best-practices).

## Database and jobs

The server uses PostgreSQL through postgres.js in development, tests, Bun and Cloudflare. A single
driver keeps CLI, app, queue, migrations and production on the same behavior. Server SQLite is not
supported: the schema and queue use PostgreSQL types and locking. Capacitor SQLite is a separate
mobile-only local store.

enqueueJob() writes to background_jobs; call it inside the same DB transaction as the feature
write when both must commit together. Workers claim rows with FOR UPDATE SKIP LOCKED and a lease.
Execution is at-least-once: handlers must be idempotent. Failures retry with bounded exponential
backoff and become dead after the configured attempt limit. Bun uses bun erp jobs:work; the
Cloudflare Worker drains a bounded batch from its scheduled handler. See docs/operations.md and
ADR-0015.

## Web file routing and lazy loading

apps/web/src/pages/__root.tsx owns the root route and Query context. The
_authenticated/route.tsx file defines the pathless authenticated layout; sibling files users.tsx,
roles.tsx, and audit.tsx create /users, /roles, and /audit. login.tsx creates /login.

Each discovered route file needs one typed createFileRoute() declaration for TanStack's generated
route ID and link types. The plugin creates routeTree.gen.ts; developers never hand-register new
routes in it. Keep route files as wrappers and screens in feature folders. Adding a URL means adding
one file, not editing a central route list. autoCodeSplitting: true makes screen components separate
chunks; root/router pending UI uses the shared skeleton state. Generated route code is checked in so
a clean typecheck has its route types. The wrapper can be only a few lines; removing the declaration
would give up the generated typed file-route contract. See [TanStack file routing](https://tanstack.com/router/latest/docs/routing/file-based-routing)
and [automatic code splitting](https://tanstack.com/router/latest/docs/guide/code-splitting).

## Feature folders

Server features use a consistent core: route.ts (HTTP contract), validation.ts (input), service.ts
(operations and transactions), policy.ts (authorization), and schema.ts (Drizzle). Add jobs.ts only
if the feature owns queue handlers.

React features group code by responsibility as needed: api/queries.ts for typed request/query
factories, hooks/ for React hooks, components/ for feature UI, screens/ for route compositions,
providers/ for feature context, stores/ for local state/persistence, and types/ for public feature
contracts. The web and mobile app never import each other's source.

## Shared atomic design

| Layer | Responsibility | May depend on |
|---|---|---|
| atoms | Basic controls and surfaces | Tokens and pure UI helpers |
| molecules | Small control combinations and feedback | Atoms and molecules |
| organisms | Interactive blocks and data surfaces | Atoms, molecules and organisms |
| templates | Reusable page/layout composition | Lower UI layers |
| app screens | Feature behavior, data and navigation | UI package and owning app/feature |

@bun-erp/ui contains no app data, RPC, router, auth or feature rules. New components must cite an
approved shadcn reference or an official reference plus a concrete custom-composition rationale in
packages/ui/component-sources.json. bun erp check:shadcn enforces the single-registry allowlist.
See skills/ui-registry/SKILL.md.

packages/i18n is runtime-neutral at its core; React consumers import its provider from the /react
entry. English is the fallback for the shipped en-US and id-ID catalogs. packages/editor's /react
entry loads the client implementation lazily and persists Lexical JSON. Import individual package
subpaths from their manifests instead of adding app-specific behavior to a shared package. The
email and PDF packages stay opt-in; browser-only PDF rendering must not enter the Worker graph.
