# Agent instructions

This repository is a Bun + TypeScript template for internal applications. It contains a Hono API,
Drizzle/PostgreSQL persistence, a React web app, a separate React + Capacitor mobile app, and shared
atomic UI. It is a template, not a finished ERP; do not add client names, product data, or business
rules without a separate product spec.

## Start with the smallest useful context

- Use docs/README.md to select one canonical document; do not load the whole docs tree.
- Read docs/architecture.md and docs/conventions.md before code changes.
- Use the matching skill from skills/README.md; source gates are the enforceable rules.
- Run `bun erp init` once after cloning or copying the template. It indexes the project and installs
  required agent skills; `check:agents` verifies both prerequisites. `bun dev` and CI do not rerun it.
- Before a nontrivial feature or architecture change, invoke the project `grill-me` skill and settle
  open product decisions before implementation. See docs/agent-init.md.
- When locating or tracing code, query CodeGraph first (MCP when available, otherwise the pinned CLI).
  Use text search after CodeGraph narrows the files or when checking exact strings.

## Project boundaries

- Runtime and package manager are Bun 1.4.2. Do not use npm, yarn, or pnpm.
- Server domain code lives in apps/server/features/<feature>; copy the departments feature and
  skills/feature-development/SKILL.md. Drizzle declarations are named schema.ts.
- `bun dev` runs Vite HMR and proxies `/api/*` to the internal API-only server. For a production-shaped
  Bun host, run `bun erp build` then `bun start`: one Hono listener serves web assets and `/api/*`.
  Use `bun erp server:api` only when the frontend is deployed separately.
- Web URLs are TanStack file routes in apps/web/src/pages; route files are small wrappers and
  screens live in web features. Do not register pages in a second route list or add -page suffixes.
- Mobile owns apps/mobile/src/main.tsx, screens and features. It must not import web source.
- Cross-app UI belongs in packages/ui and follows atoms → molecules → organisms → templates.
- packages/utils is only for pure, runtime-neutral logic with real consumers in two or more apps.
- Shared localization lives in packages/i18n; rich-text UI lives in packages/editor and persists
  Lexical JSON. Email and PDF components are opt-in packages; keep browser PDF rendering out of
  the Cloudflare Worker dependency graph.
- Server persistence always uses PostgreSQL through postgres.js. Tests require a disposable
  PostgreSQL URL; mobile SQLite is a separate offline store.
- Queue handlers are at-least-once: keep them idempotent and enqueue in the feature write transaction.
- API routes are versioned under /api/v1. Keep 401 (no session), 403 (no permission), and 404 (no row) distinct.
- Browser QA is Playwright-only. Run `bun run qa` against local/non-production data; do not add or run Cypress.
- `bun erp role:list` shows role keys. The first `bun erp user:create` account defaults to owner; subsequent accounts default to staff. Use `--role` to choose explicitly.
- `bun erp make:feature`, `make:migration`, and `make:seeder` create the supported starting points. Migrations are forward-only TypeScript; feature route mounting stays explicit for Hono RPC inference.
- Comments, technical names, enum values, and configuration keys use English. User-facing copy may be localized.
- Never commit secrets, weaken gates, or claim unrun tests. Dependencies must be exact-pinned and necessary.

## Human-owned task status

Never set a task to ready or done. Leave agent work in_progress with actual evidence. Use
IMPLEMENTATION_DONE → API_UNIT_TESTED → UI_TESTED → READY_FOR_USE; unverified work is NOT_RUN or BLOCKED.

## Before handoff

    bun run lint
    bun erp check
    bun erp test

Biome is mandatory in `apps/web`, `apps/server`, and `apps/mobile`. `bun run lint` checks the entire
workspace; each app also exposes its own `lint` and `format` scripts. `bun install` installs the
tracked `.githooks/pre-push` hook, which runs `bun run check:biome` before every push. CI repeats the
same lint check and `bun erp check`.

Report the commands actually run and their results. bun erp --help is the source of truth for CLI commands.
