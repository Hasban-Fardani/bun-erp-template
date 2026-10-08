# Architecture and file map

Start at the owner of the change below. Feature internals are optional: add api, components, hooks,
providers, stores or types only when that feature needs them. Do not create empty folders to satisfy
a convention.

`bun erp init` installs the chosen combination (server, web, mobile, or a mix) from
`templates/apps/{server,web,mobile}` and registers the workspaces, so every `apps/...` path below
describes an installed app. Web and mobile bind the server's typed Hono contract when the server
app is present; without it they install in detached mode (stub `src/lib/rpc.ts`, no
`@bun-erp/server` dependency) and a later `init` re-fits the real client. Full flow:
[development](development.md). Server-owned CLI commands live in `apps/server/cli/` and appear in
`bun erp --help` only once the server app is installed; the root `cli/` never imports `apps/**`.

| Change | Start here | Ownership |
|---|---|---|
| Choose or add an app | templates/apps/<server\|web\|mobile>, cli/lib/app-catalog.ts | Catalog copy shared by `bun erp init` and `bun erp apps:create`; registers the workspace and binds/detaches the server contract |
| Run web + API on Bun | apps/server/bootstrap/server.ts | Production listener and request dispatch |
| Build application dependencies | apps/server/bootstrap/bootstrap.ts | Environment, database, migrations, logger and auth |
| Compose HTTP behavior | apps/server/http/app.ts, apps/server/routes/api.ts | Middleware, docs and error envelope; version prefix and feature route mounts |
| Add an API feature | apps/server/features/<name> | route.ts, validation.ts, service.ts, policy.ts, schema.ts; optional jobs.ts |
| Add a migration | apps/server/database/migrations/NNNN_name.ts | Forward-only TypeScript migration exporting up(database) |
| Add shared runtime services | apps/server/infra | Config, database, logging, durable jobs, cache facade and transactional events |
| Cache a computed value or react to a domain event | apps/server/infra/cache, apps/server/infra/events | `cache.remember(...)`; `defineEvent`/`defineListener` dispatched in the write transaction (see Cache and events below) |
| Throttle, pause or harden the HTTP surface | apps/server/http, apps/server/cli/commands/app.ts | Database-backed rate limiter, `bun erp down`/`up` maintenance mode, cross-site request guard (see operations.md) |
| Add a web URL | apps/web/src/pages | Small TanStack file route wrappers; route tree is generated |
| Implement a web screen | apps/web/src/features/<name>/screens | Screen composition; feature API, hooks, components and types stay nearby |
| Start or add mobile screens | apps/mobile/src/main.tsx, apps/mobile/src/screens (install with `bun erp init` or bun erp apps:create <name> mobile) | Separate React entry and mobile-only composition |
| Store offline mobile data | apps/mobile/src/features/offline/stores/offline-store.ts | Encrypted native SQLite / browser IndexedDB adapter |
| Change shared presentation | packages/ui/src | Atomic layers, tokens and approved upstream component references |
| Add cross-app pure logic | packages/utils/src | Runtime-neutral code used by at least two app workspaces |
| Change a quality gate | cli/gates, cli | Read-only checks and CLI orchestration |
| Localize shared app copy and formats | packages/i18n | Typed catalogs, locale resolution and React provider |
| Add rich text editing UI | templates/packages/editor (install with bun erp packages:install editor) | Lazy React entry, composable Lexical UI and JSON value |
| Compose email or PDF documents | templates/packages/email, templates/packages/pdf (install on demand) | Opt-in rendering components with separate runtime boundaries |
| Send mail from the server | `bun erp features:install mail` (templates/packages/mail) | Opt-in transport; the default server keeps only the database notification channel |
| Add tenant scoping | `bun erp features:install organizations` (templates/features/organizations) | Opt-in Better Auth `organization` plugin: organization/member/invitation tables and the session's active organization; no new routes or permissions |

## Runtime modes

Hono's `fetch` contract lets the HTTP application run behind different host adapters; it does not
make every application dependency runtime-neutral. This codebase implements and tests
two targets: Bun (`apps/server/bootstrap/server.ts`) and Cloudflare Workers (`apps/server/bootstrap/cloudflare-entry.ts`,
the wrangler entry that re-exports `apps/server/bootstrap/worker.ts`). The
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

bootstrap/server.ts creates the runtime context through bootstrap/bootstrap.ts, then http/app.ts mounts the versioned
route tree assembled in routes/api.ts under /api/v1. Request middleware sets the correlation ID and structured
logging context. A feature route authorizes, validates input, and calls its service. The service
owns domain operations, transactions and audit writes; schema.ts declares Drizzle tables. The
HTTP layer returns { data, meta: { requestId } }; errors return
{ error: { code, message, fields? }, meta }.

Features communicate through public service functions. Do not reach into another feature's tables
as an untracked shortcut. The Hono route tree is also the source of the Hono RPC type and generated
OpenAPI document. Cloudflare serves Workers Assets from the Worker entry and sends /api/* through
the same Hono app.

Better Auth serves its own endpoints under `/api/v1/auth/*` through one wildcard handler. The
opt-in `organizations` feature extends that plugin set instead of mounting feature routes: it
registers the Better Auth `organization` plugin, adds its tables to the drizzle adapter and to
`database/schema.ts`, and adds `activeOrganizationId` to the session. The default server stays
tenant-free and RBAC stays independent of organizations.

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

## Cache and events

`apps/server/infra/cache` is the cache facade: `cache.get/set/remember/forget` and
`cache.namespace(name).clear()` over `CACHE_DRIVER=memory|database|cloudflare-kv`. `memory` is per
process, `database` (`cache_entries`, migration `0014_cache`, pruned by the `cache.prune` schedule)
is shared across replicas and isolates, and `cloudflare-kv` (binding `CACHE_KV_BINDING`) is global
but eventually consistent. A cached value is an optimisation: always recomputable from PostgreSQL,
never a source of truth. The RBAC permission cache is built on the facade and refuses
`cloudflare-kv`.

`apps/server/infra/events` adds `defineEvent<T>(name)`, `defineListener({ name, event, handler })`
and `dispatch(tx, event, payload)`. Dispatch enqueues one durable job per listener in the caller's
transaction, so rollback dispatches nothing; listeners retry independently and must be idempotent
(`idempotencyKey` dedupes repeated dispatches). A feature declares its listeners next to its events
and adds them to `features/events.ts`. See ADR-0016.

## Web file routing and lazy loading

apps/web/src/pages/__root.tsx owns the root route and Query context. The
_authenticated/route.tsx file defines the pathless authenticated layout; the default install ships
index.tsx (overview) and notifications.tsx beside it, and login.tsx creates /login. Admin screens
are catalog features: `bun erp features:install users` (also roles, audit) copies users.tsx,
roles.tsx, or audit.tsx here and regenerates the route tree.

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

## Splitting a feature into a service

The semi-monolith is extraction-ready by construction: a server feature already owns its routes,
its jobs and its tables, so turning it into a separate service is a move, not a rewrite.

- **Routes mount separately.** Each feature declares `feature.ts` with `defineFeature` and is
  mounted through `app.route()` in `routes/api.ts`. That sub-app is already a self-contained Hono
  contract; the new service mounts the same router under its own base URL.
- **Side effects go through the queue.** Writes call `enqueueJob` inside the same transaction, and
  handlers are at-least-once and idempotent. The extracted service keeps its own `background_jobs`
  table and worker; callers move from an in-process enqueue to the feature's API.
- **Tables belong to one feature.** `schema.ts` and the migrations that create those tables move
  with the folder, and the new service runs them through its own migration ledger. Cross-feature
  access already goes through `features/<b>/index.ts`; the `FEATURE_BOUNDARY` rule in
  `check:architecture` rejects deep imports, so nothing reaches into another feature's tables.
  Keep that rule green — it is the extraction seam.
- **Auth stays shared.** Sessions are Better Auth's, validated against the same secret and
  database contract; the split service verifies the same session cookie or token instead of
  inventing its own identity state.

To extract a feature:

1. Move `apps/server/features/<name>`, its migrations and its tests into the new service.
2. Keep `index.ts` as the only public entry; replace the remaining in-process imports of the
   feature with calls to its HTTP API.
3. Point the client at the new origin with `VITE_API_BASE_URL` (`apps/web/src/lib/rpc.ts`); the
   typed Hono client binds to the extracted service's `AppType` with no new client code.
4. Keep the durable queue as the side-effect path, idempotency key included, so retries stay safe
   across the split.

This section is the readiness statement: no new code is required for the seam to exist. Per-process
caches (see [security](security.md)) are optimisations with a TTL, never the source of truth, so an
extracted service or a replica is correct without another process's memory.

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
entry. English is the fallback for the shipped en-US and id-ID catalogs. The editor package's /react
entry (installed from templates/packages/editor) loads the client implementation lazily and persists
Lexical JSON. Import individual package subpaths from their manifests instead of adding app-specific
behavior to a shared package. The email, PDF and mail packages stay opt-in; browser-only PDF
rendering must not enter the Worker graph, and the default server carries no mail transport or
`nodemailer` dependency.

Packages split by runtime target only when they serve more than one: `storage` is `src/ui`,
`src/capacitor`, `src/server` and `src/utils`; `i18n` is `src/utils` plus `src/ui`; `data-table` is
`src/ui` plus `src/server`. A single-target package stays flat, with `src/index.ts` and
`src/styles.css` at the root. `bun erp check:package-targets` enforces the layout.
