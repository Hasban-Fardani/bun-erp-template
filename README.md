<!-- project-identity:start -->
<!-- template-only -->
# Bun ERP Template

Starter for internal applications: versioned Hono RPC API, Drizzle/PostgreSQL, Better Auth,
RBAC and append-only audit, and a file-routed React admin app. An optional React + Capacitor mobile
app waits in the app catalog. The React apps share atomic UI, i18n and editor packages. This
repository contains reference infrastructure, not a client's ERP workflows.
<!-- /template-only -->
<!-- project-identity:end -->

## First run

    bun install --frozen-lockfile
    cp .env.example .env
    bun erp init                    # choose server, web, mobile, or a combination
    bun erp db:migrate
    bun erp db:seed
    bun erp user:create <email> <password> --role owner --name <name>
    bun dev

`bun erp init` installs the app combination you choose (default `server+web`) and the agent tooling.
Full flow, flags and CI usage: [docs/development.md](docs/development.md).

Open the single URL printed by Vite (by default `http://localhost:5173`). The web app and Hono API
share that origin; `/api/*` is proxied to the internal API process. The app and CLI read the same
database configuration from `.env`. Keep `APP_ENV=development` and point the configured database at
a local development database. See [development setup](docs/development.md) for database and port
details.

The seed creates the `owner`/`staff` role keys and the permission catalogue, but no login account.
The first `bun erp user:create <email> <password>` account becomes the owner automatically; use
`--role owner --name <name>` to be explicit. Create the initial account after applying migrations
and seeding PostgreSQL. See the [development guide](docs/development.md) for details.

For a local production-shaped run, set `APP_DEPLOY_TARGET=bun` and
`APP_WEB_MODE=integrated` in `.env`, build with `bun erp build`, then run `bun start`. One Bun server
serves the built React app at `/` and the versioned Hono API at `/api/*`. Set
`APP_WEB_MODE=separate` and use `bun erp server:api` when deploying the frontend separately. Set
`APP_DEPLOY_TARGET=cloudflare` for `bun erp build` to produce the Cloudflare Worker and static assets;
Cloudflare currently requires integrated hosting. These are the only runtime adapters implemented.

Browser QA uses Playwright only: set `QA_EMAIL` and `QA_PASSWORD`, start `bun dev`, install the
admin screens (`bun erp features:install users roles audit`), then run `bun erp qa`. Planning,
exploratory testing, and report rules are documented in `.agents/qa-project-context.md` and the
installed QA skills.

For a local Docker stack with PostgreSQL, copy `.env.docker.example` to `.env.docker`, change both
local-only passwords, then run `docker compose --env-file .env.docker up --build`. The Compose
profile is for local development; see [deployment.md](docs/deployment.md) before exposing a server.

## Verify changes

    bun erp check
    bun erp test
    bun erp build
    bun run lint
    bun run format:check

`bun erp check` runs Biome, TypeScript, architecture and readiness gates. The Git pre-push hook
runs `bun run check:biome`; CI runs that same required formatter/linter gate. Independent checks
run concurrently with a bounded worker count. Tests run server, web and shared-package suites, plus
the mobile suite once the catalog app is installed. Browser QA and native device tests have separate
prerequisites.

## Apps and shared packages

- `bun erp init` installs apps from the `templates/apps/` catalog; `bun erp apps:create
  <name> <server|web|mobile>` adds another app later (server scaffolds a minimal Bun service; web
  and mobile copy their catalog). See [templates/apps/README.md](templates/apps/README.md).
- Web and mobile bind the server's typed Hono RPC contract when the server app is installed. Without
  a server they ship a detached shell with no `@bun-erp/server` dependency; a later `bun erp init`
  that adds the server re-fits the typed client.
- apps/server/features contains feature-owned API, validation, services, policies and Drizzle schemas.
- The default web app is login plus the overview (Beranda), the notifications inbox and the AI
  assistant panel ("Ask AI", ⌘/Ctrl+J; Workers AI by default, any OpenAI-compatible API on a VPS;
  see docs/ai.md). Admin
  screens are catalog features: users, roles and audit install with `bun erp features:install
  <name>`, wiring their page, navigation row and locale keys. Their server modules (`identity`,
  `rbac`, `audit`) stay core, so a web feature ships presentation only.
- Server features such as departments also wire permissions, audit fields and the route mount when
  installed. Every catalog feature is a `feature.json` manifest under templates/features; see
  [templates/features/README.md](templates/features/README.md).
- apps/web/src/pages is generated file routing; screen implementations live under web features.
- apps/mobile/src/main.tsx is the separate React entry of the catalog app
  (`bun erp apps:create <name> mobile`). Its offline feature stores device records in
  encrypted native SQLite and uses IndexedDB for browser development; drafts never sync automatically.
- packages/ui contains reusable atoms, molecules, organisms and templates and depends on no optional
  package. The default app imports no optional package and no table package, and the Cloudflare
  Worker never imports one.
- packages/i18n provides shared English and Indonesian catalogs and locale formatting.
- packages/utils contains only pure utilities shared across app boundaries.
- Opt-in packages wait in templates/packages and install with `bun erp packages:install <name>`:
  data-table (local in-memory and controlled server table modes on TanStack Table plus the shared
  `ResourceTable`; `features:install` pulls it in automatically for the screens that need it),
  charts (separately imported chart families on Recharts plus the lazy `Sparkline` and `MetricList`),
  editor (lazy Lexical JSON editor with accessible toolbar primitives), email, and pdf. PDF rendering
  stays in the browser so the Cloudflare Worker bundle remains small.

For Cloudflare, bun erp cloudflare:build creates and preflights the Worker artifact; deployment
requires a configured Worker and PostgreSQL Hyperdrive binding. See docs/deployment.md.

Use docs/architecture.md to locate the right file and docs/mobile.md for the catalog app, API
origin, app identity, offline storage, and native toolchains.

[Documentation index](docs/README.md) · [Agent guide](AGENTS.md)
