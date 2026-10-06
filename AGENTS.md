# Agent instructions

This repository is a Bun + TypeScript template for internal applications. It contains a Hono API,
Drizzle/PostgreSQL persistence, a React web app, an optional React + Capacitor mobile app, and shared
atomic UI — but `apps/` ships **empty**: `bun erp init` installs the combination you choose from the
`templates/apps/` catalog. It is a template, not a finished ERP; do not add client names, product
data, or business rules without a separate product spec.

## Start with the smallest useful context

- Use docs/README.md to select one canonical document; do not load the whole docs tree.
- Read docs/architecture.md and docs/conventions.md before code changes; docs/gates.md catalogs
  every check gate and how to add one.
- Use the matching skill from skills/README.md; source gates are the enforceable rules.
- Run `bun erp init` once after cloning or copying the template. It installs the chosen app
  combination (choice list; `--apps server,web --yes` in CI), runs the first `bun install`, indexes
  the project at the pinned CodeGraph version, wires the MCP server into detected agents, and
  installs required agent skills; `check:agents` verifies the skills, CLI, and index. CI setup runs
  `bun erp init --apps server,web --yes` on every job; `bun dev` does not install anything.
- Before a nontrivial feature or architecture change, invoke the project `grill-me` skill and settle
  open product decisions before implementation. See docs/agent-init.md.
- When locating or tracing code, query CodeGraph first (MCP when available, otherwise the pinned CLI).
  Use text search after CodeGraph narrows the files or when checking exact strings.

## Project boundaries

- Runtime and package manager are Bun 1.4.2. Do not use npm, yarn, or pnpm.
- `apps/` ships empty. App catalogs live in `templates/apps/{server,web,mobile}` and install through
  `bun erp init` (combination choice) or `bun erp apps:create <name> <server|web|mobile>`. Server-
  and database-facing CLI commands (`db:*`, `user:*`, `role:*`, `jobs:*`, `route:list`, `doctor`,
  `env:list`) live in the server catalog under `apps/server/cli/` and appear in `bun erp --help` only
  once the server app is installed. Never import `apps/**` from root `cli/` (including `cli/gates/`);
  the template must typecheck and pass `bun erp check` with `apps/` empty.
- Web and mobile bind the server's typed Hono contract when a server app exists. Without a server
  they install in detached mode (`src/lib/rpc.ts` stub, no `@bun-erp/server` dependency); a later
  `bun erp init` that adds the server re-fits the real client.
- Server domain code lives in apps/server/features/<feature>; install the reference module with
  `bun erp features:install departments` (catalog: templates/features) and follow
  skills/feature-development/SKILL.md. Drizzle declarations are named schema.ts. The tenant layer is
  opt-in: `bun erp features:install organizations` registers the Better Auth `organization` plugin
  (organizations, members, invitations, active organization on the session) and its migration; the
  default server stays tenant-free and RBAC stays independent of organizations.
- The default web app is login + overview (Beranda) + notifications. The admin screens are web-kind
  catalog features: `bun erp features:install users` (also roles, audit) copies the presentation,
  page wrapper, design spec, navigation row and locale keys, and installs the `data-table` catalog
  package those screens need. Their server modules (identity auth, rbac permissions, audit logging)
  stay core.
- Data tables come from the opt-in `data-table` catalog package (`bun erp packages:install
  data-table`); apps/web has no data-table dependency by default.
- `bun dev` runs Vite HMR and proxies `/api/*` to the internal API-only server. For a production-shaped
  Bun host, run `bun erp build` then `bun start`: one Hono listener serves web assets and `/api/*`.
  Use `bun erp server:api` only when the frontend is deployed separately.
- Web URLs are TanStack file routes in apps/web/src/pages; route files are small wrappers and
  screens live in web features. Do not register pages in a second route list or add -page suffixes.
- Mobile is a catalog app under templates/apps/mobile, installed with
  `bun erp apps:create <name> mobile`. Once installed at apps/mobile it owns src/main.tsx, screens
  and features, and must not import web source.
- Cross-app UI belongs in packages/ui and follows atoms → molecules → organisms → templates.
- packages/utils is only for pure, runtime-neutral logic with real consumers in two or more apps.
- Shared localization lives in packages/i18n. Charts, rich-text editor, email, PDF, and the mail
  transport are opt-in catalog packages under templates/packages; install a rendering package with
  `bun erp packages:install <name>` and the server mail transport with `bun erp features:install
  mail`, which installs the package and wires `ctx.mail`, the `mail.send` job and the notifications
  channel. The default server has no mail transport and no `nodemailer`. The editor persists Lexical
  JSON; keep browser PDF rendering out of the Cloudflare Worker dependency graph.
- Server persistence always uses PostgreSQL through postgres.js. Tests require a disposable
  PostgreSQL URL; mobile SQLite is a separate offline store.
- Queue handlers are at-least-once: keep them idempotent and enqueue in the feature write transaction.
- API routes are versioned under /api/v1. Keep 401 (no session), 403 (no permission), and 404 (no row) distinct.
- Browser QA is Playwright-only. Run `bun run qa` against local/non-production data; do not add or run Cypress.
- `bun erp role:list` shows role keys. The first `bun erp user:create` account defaults to owner; subsequent accounts default to staff. Use `--role` to choose explicitly. `role:show/create/edit/delete` and `user:show/edit/delete/grant/revoke/passwd` cover the rest; deletes require `--force`.
- `bun erp make:feature` generates a server CRUD module, its test, its web screen, and a create-table migration, then registers the permission keys, audit entity, route mount, sidebar entry, and locale keys. `make:migration` reads Laravel-style names (`create_x_table`, `add_y_to_x_table`) and `make:seeder` normalizes the `-seeder` suffix.
- `bun erp apps` lists workspace apps with build, port, and test status; `apps:status <name>` shows one app; `apps:create <name> <server|web|mobile>` adds a workspace app (server scaffolds a minimal Bun service; web/mobile copy their catalog) and registers it in the root workspaces. Migrations stay forward-only TypeScript; feature route mounting stays explicit for Hono RPC inference.
- Comments, technical names, enum values, and configuration keys use English. User-facing copy may be localized.
- Never commit secrets, weaken gates, or claim unrun tests. Dependencies must be exact-pinned and necessary.

## Tests come first (TDD)

Write the failing test before the implementation; a feature is not done until its test goes red then
green. This is enforced, not optional:

- Every server feature ships a test under `apps/server/tests/features/<feature>/`, and generators
  emit that test. The `tdd` gate (part of `bun erp check`) fails a feature that has none.
- Route tests use `hono/testing` `testClient(app)` for typed requests; keep `app.request` only for
  cases the typed client cannot express.
- Record red→green evidence in the task file: the failing output first, then the passing run.
- Never claim a test passed without running it. Unverified work is NOT_RUN or BLOCKED.

## Human-owned task status

Never set a task to ready or done. Leave agent work in_progress with actual evidence. Use
IMPLEMENTATION_DONE → API_UNIT_TESTED → UI_TESTED → READY_FOR_USE; unverified work is NOT_RUN or BLOCKED.

## Before handoff

    bun run lint
    bun erp check
    bun erp test

Biome is mandatory in `apps/web`, `apps/server`, and every created app (the mobile catalog copy
included). `bun run lint` checks the entire workspace; each app also exposes its own `lint` and
`format` scripts. `bun install` installs the tracked `.githooks/pre-push` hook, which runs
`bun run check:biome` before every push. CI repeats the same lint check and `bun erp check`.

Report the commands actually run and their results. bun erp --help is the source of truth for CLI commands.
