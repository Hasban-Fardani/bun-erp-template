# AGENTS.md

Bun + TypeScript starter for internal business apps: modular monolith, Hono HTTP layer,
Drizzle ORM, React admin shell, RBAC with an append-only audit trail, and API docs generated
from the routes themselves.

This is a **template**, not a finished ERP. Business domains (attendance, payroll, inventory,
procurement, CRM) arrive from separate product specs, so nothing in this repo may assume a
particular client, product, or business rule.

Runtime is **Bun**, package manager is **bun**. Never substitute npm, yarn, or pnpm.

## Before you hand anything over

```bash
bun erp check    # gates (skills, task, scope, slop, react) + biome + tsc
bun erp test     # backend suite, then web suite
```

Report what you actually ran and what it returned — not what should happen. `bun erp --help`
lists every command; prefer it over any list copied into a document.

## Limits that are not negotiable

1. **Never set a task status to `ready` or `done`.** Humans only. Stop at `in_progress` with
   evidence attached.
2. **Never claim something is tested without running it.** Honest ladder:
   `IMPLEMENTATION_DONE` → `API_UNIT_TESTED` → `UI_TESTED` → `READY_FOR_USE`. Anything
   unverified is `NOT_RUN`/`BLOCKED` — never "should work".
3. **Do not invent business rules, client names, domains, or product data.** `bun erp
   check:scope` rejects them. Real names live in the deployment, not in this repo.
4. **Never commit secrets.** Placeholders and `.env.example` only.
5. **Do not add a dependency** when a Bun or Web Platform API already does the job.
6. **Do not invent architecture.** A new module copies `apps/server/modules/departments`.
7. **401 and 403 are different.** No session → 401. Valid session, missing permission → 403.
   A missing row → 404.

## Shape of the repo

```
apps/server/          the API — `server.ts` is the only entrypoint today
  http/               Hono middleware, error envelope, route registration
  platform/           cross-module foundations: config, database, observability
  modules/<name>/     one module = one domain: schema, data, service, policy, route
  migrations/         forward-only SQL, numbered across all modules
apps/web/             React + Vite admin shell
tools/                the `bun erp` gates
skills/               operational instructions for agents (see below)
docs/                 documentation (see below)
```

A request flows `server.ts` → middleware (request id) → route (validate, authorize) →
service (domain logic, transaction) → envelope `{ data, meta: { requestId } }`, and every
error becomes `{ error: { code, message, fields? }, meta }`.

## Documentation — read the one you need

- `docs/architecture.md` — repo shape, request lifecycle, module anatomy, boundaries.
  *Read before adding a module or touching the HTTP layer.*
- `docs/conventions.md` — the code rules the gates enforce, including comment language
  (English, why-not-what). *Read before writing code.*
- `docs/development.md` — clean checkout to running server, env, first owner account.
  *Read when setting up or onboarding.*
- `docs/testing.md` — `bun:test` harness, PGlite vs Postgres, what is and is not covered.
  *Read before writing tests.*
- `docs/security.md` — authentication, authorization, audit, secret handling, log redaction.
  *Read before touching access control or anything that logs.*
- `docs/operations.md` — logging, health/readiness, migrations, backup.
  *Read before changing anything that runs in production.*
- `docs/deployment.md` — targets and artifacts. *Read before deploying.*
- `docs/adr/` — numbered decisions with the alternatives that were rejected.
  *Read before proposing an architecture change, and do not re-propose a rejected option.*
- `docs/tasks/` — task status and evidence. *Only humans promote a task to `ready`/`done`.*

## Skills — load the one that matches your task

- `skills/module-development/` — module work order, keeping schema/data/service/policy/route
  consistent. *Use when adding or changing a module under `apps/server/modules`.*
- `skills/database-drizzle/` — one Postgres dialect across two drivers (PGlite dev/test,
  postgres production), query and migration rules. *Use when writing queries, migrations, or
  seed data.*
- `skills/testing/` — test context per file, real HTTP via `app.request()`, no heavy mocks.
  *Use when writing tests or debugging a failure in `apps/server/tests`.*
- `skills/template-guardrails/` — the mistakes this repo has already paid for: unverified
  claims, dead CSS classes, silencing a gate without checking, `node:` imports, writing outside
  the allowed directories. *Use before reporting any work as finished.*
