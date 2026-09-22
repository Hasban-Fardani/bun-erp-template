# AGENTS.md

Instructions for AI coding agents working in this repo. Humans: see `README.md` and `docs/`.

## What this is

Bun + TypeScript starter for internal business apps: modular monolith, Hono HTTP layer,
Drizzle ORM, React admin shell, RBAC with an append-only audit trail. Hybrid deployment —
static web on a CDN, API on a server, cross-origin with an origin allowlist.

**Not a finished ERP.** Only foundation plus two reference modules. Business domains
(attendance, payroll, inventory, procurement, CRM) come from separate product specs.

## Hard limits

1. **Do not invent architecture.** Copy the existing shape. A new module mirrors
   `apps/server/modules/departments` — no new layers, no new patterns.
2. **Never set a task status to `ready` or `done`.** Humans only. Stop at `in_progress`
   and hand over evidence.
3. **Do not invent business rules, client names, or product data.** This is a template.
   `bun erp check:scope` rejects it.
4. **Never claim something is tested without running it.** Honest status ladder:
   `IMPLEMENTATION_DONE` → `API_UNIT_TESTED` → `UI_TESTED` → `READY_FOR_USE`.
   Untested means `NOT_RUN`/`BLOCKED`, not "probably fine".
5. **Do not add a dependency** when a Bun or Web Platform API already does the job.
6. **Write code comments in English.** No Indonesian in comments — including SQL comments.
   Comments explain *why*, never restate the line below. One or two lines per block.

## Verify before handing off

```bash
bun erp check    # static gates: skills, task, scope, slop + biome, tsc, react
bun erp test     # backend suite then web suite
```

Report the commands you ran and their real output. Never describe what *should* happen.

## Layout

```
apps/server/            API — modular monolith
  http/                 app wiring, error envelope, route registration, API docs
  modules/<name>/       one folder per domain (see anatomy below)
  platform/             config, database, logging — no business logic
  migrations/           numbered SQL, applied in filename order
  tests/                bun:test suites
apps/web/               React admin shell (Vite, TanStack Router + Query)
  src/pages/            one file per screen
  src/features/<name>/  API hooks, types, forms per domain
  src/shared/           UI primitives, layout, formatting
  src/config/           build-time UI config (app name, theme)
  src/routes/           route tree — every navigable path lives here
tools/                  gate implementations invoked by `bun erp check`
docs/                   architecture, conventions, ops, ADRs, task status
```

## Module anatomy

A domain module is five files, each with one job:

- `data.ts` — Drizzle table definitions
- `schema.ts` — input contracts (zod) and their inferred types
- `policy.ts` — action → permission mapping
- `service.ts` — business logic; the only place that writes audit rows
- `route.ts` — validate, authorize, delegate, wrap in the response envelope

Register the module in `apps/server/http/routes.ts`.

## Conventions

- **Response envelope.** Success is `{ data, meta: { requestId } }`; failure is
  `{ error: { code, message, fields? }, meta }`. Do not return bare JSON from a handler.
- **Organization comes from the session**, never from request input.
- **401 vs 403 are different.** No session → 401. Valid session, missing permission → 403.
  A missing row is 404, not 403.
- **Authorization is enforced server-side** and tested. Hiding a nav item is UX, not security.
- **Audit rows are append-only** and written inside the same transaction as the change.
- **API docs come from the routes themselves.** Attach `doc()` metadata to the route; never
  maintain a separate path table. A test fails if a registered route has no documented operation.
- **Never commit secrets.** Use placeholders and `.env.example`. Names of real clients,
  domains, or products do not belong in this repo.

## Commands

```bash
bun erp check           # all gates (run before handing off)
bun erp test            # backend + web test suites
bun erp db:status       # applied vs PENDING migrations (exit 1 if any pending)
bun erp db:migrate      # apply pending migrations
bun erp db:seed         # sync permission catalogue + system roles from code
bun erp route:list      # every registered route
bun erp user:create     # bootstrap the first owner (no mail server needed)
bun erp user:passwd     # reset a password
```

New module or endpoint → add its metadata, then re-run `bun erp check`. If a gate fails,
fix the cause; do not silence it without a written reason.

## Where things go

- Input contract → `modules/<name>/schema.ts`
- Table → `modules/<name>/data.ts`, migration → `apps/server/migrations/`
- Business logic → `modules/<name>/service.ts`
- Authorization → `modules/<name>/policy.ts`
- HTTP handler → `modules/<name>/route.ts`
- Screen → `apps/web/src/pages/`, path → `apps/web/src/routes/route-tree.tsx`
- Navigation item → `apps/web/src/components/layout/sidebar-data.ts`
- Prose docs → `docs/`
