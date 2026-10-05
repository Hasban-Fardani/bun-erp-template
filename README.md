# Bun ERP Template

Starter for internal applications: versioned Hono RPC API, Drizzle/PostgreSQL, Better Auth,
RBAC and append-only audit, a file-routed React admin app, and an independent React + Capacitor
mobile app. Both React apps share atomic UI, i18n and editor packages. This repository contains
reference infrastructure, not a client's ERP workflows.

## First run

    bun install --frozen-lockfile
    cp .env.example .env
    bun erp init
    bun erp db:migrate
    bun erp db:seed
    bun erp user:create <email> <password> --role owner --name <name>
    bun dev

Open the single URL printed by Vite (by default `http://localhost:5173`). The web app and Hono API
share that origin; `/api/*` is proxied to the internal API process. The app and CLI read the same
database configuration from `.env`. Keep `APP_ENV=development` and point the configured database at
a local development database. See [development setup](docs/development.md) for database and port
details.

The seed creates the default organization and `owner`/`staff` role keys, but no login account.
The first `bun erp user:create <email> <password>` account becomes the owner automatically; use
`--role owner --name <name>` to be explicit. The app and CLI use the same database settings from
`.env`. Create the initial account after applying migrations and seeding PostgreSQL. CLI and app
writes use the same PostgreSQL database while the server is running. See the
[development guide](docs/development.md) for details.

For a local production-shaped run, set `APP_DEPLOY_TARGET=bun` and
`APP_WEB_MODE=integrated` in `.env`, build with `bun erp build`, then run `bun start`. One Bun server
serves the built React app at `/` and the versioned Hono API at `/api/*`. Set
`APP_WEB_MODE=separate` and use `bun erp server:api` when deploying the frontend separately. Set
`APP_DEPLOY_TARGET=cloudflare` for `bun erp build` to produce the Cloudflare Worker and static assets;
Cloudflare currently requires integrated hosting. These are the only runtime adapters implemented.

Run `bun erp init` once after cloning or copying the template to index the project and install the
required agent skills. Development commands do not refresh or install agent tooling.
See docs/agent-init.md and docs/README.md.

Browser QA uses Playwright only: set `QA_EMAIL` and `QA_PASSWORD`, start `bun dev`, then run
`bun run qa`. Planning, exploratory testing, and report rules are documented in
`.agents/qa-project-context.md` and the installed QA skills.

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
run concurrently with a bounded worker count. Tests run server, web, mobile and shared-package
suites. Browser QA and native device tests have separate prerequisites.

## Apps and shared packages

- apps/server/features contains feature-owned API, validation, services, policies and Drizzle schemas.
- apps/web/src/pages is generated file routing; screen implementations live under web features.
- apps/mobile/src/main.tsx is a separate React entry. Its offline feature stores device records in
  encrypted native SQLite and uses IndexedDB for browser development; drafts never sync automatically.
- packages/ui contains reusable atoms, molecules, organisms and templates; packages/data-table
  offers local in-memory and controlled server table modes on TanStack Table; packages/charts
  offers separately imported chart families on Recharts. Neither optional package is imported by
  the Cloudflare Worker.
- packages/i18n provides shared English and Indonesian catalogs and locale formatting; packages/editor
  provides a lazy Lexical JSON editor with accessible toolbar primitives.
- packages/utils contains only pure utilities shared across app boundaries. packages/email and
  packages/pdf hold opt-in document/email components; PDF rendering stays in the browser so the
  Cloudflare Worker bundle remains small.

For Cloudflare, bun erp cloudflare:build creates and preflights the Worker artifact; deployment
requires a configured Worker and PostgreSQL Hyperdrive binding. See docs/deployment.md.

Use docs/architecture.md to locate the right file and docs/mobile.md for the API origin, app identity,
offline storage, and native toolchains.

[Documentation index](docs/README.md) · [Agent guide](AGENTS.md)
