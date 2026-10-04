# Bun ERP Template

Starter for internal applications: versioned Hono RPC API, Drizzle/PostgreSQL, Better Auth,
RBAC and append-only audit, a file-routed React admin app, and an independent React + Capacitor
mobile app. Both React apps share atomic UI, i18n and editor packages. This repository contains
reference infrastructure, not a client's ERP workflows.

## First run

    bun install --frozen-lockfile
    bun erp init
    bun dev

Open the single URL printed by Vite (by default `http://localhost:5173`). The web app and Hono API
share that origin; `/api/*` is proxied to the internal API process. Local development creates and
seeds an isolated PGlite database under `.data/development` and ignores repository `.env` values.
See [development setup](docs/development.md) for port overrides and non-local configuration.

Run `bun erp init` once after cloning or copying the template to index the project and install the
required agent skills. Development commands do not refresh or install agent tooling.
See docs/agent-init.md and docs/README.md.

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
