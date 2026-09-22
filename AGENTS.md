# AGENTS.md

Bun + TypeScript starter for internal business apps: modular monolith, Hono HTTP layer,
Drizzle ORM, React admin shell, RBAC with an append-only audit trail. This is a template,
not a finished ERP — business domains come from separate product specs, so nothing here
may assume a particular client, product, or rule.

Runtime is **Bun**, package manager is **bun**. Never substitute npm, yarn, or pnpm.

Verified with a clean checkout:

```bash
bun erp check    # all gates: skills, task, scope, slop, react + biome, tsc
bun erp test     # backend suite, then web suite
```

## Limits that are not negotiable

1. **Never set a task status to `ready` or `done`.** Humans only. Stop at `in_progress` and
   hand over evidence.
2. **Never claim something is tested without running it.** Honest ladder:
   `IMPLEMENTATION_DONE` → `API_UNIT_TESTED` → `UI_TESTED` → `READY_FOR_USE`. Untested means
   `NOT_RUN`/`BLOCKED`, never "probably fine".
3. **Do not invent business rules, client names, domains, or product data.** This repo is a
   template; `bun erp check:scope` rejects it. Real names belong in the deployment, not here.
4. **Never commit secrets.** Placeholders and `.env.example` only.
5. **Do not add a dependency** when a Bun or Web Platform API already does the job.
6. **Do not invent architecture.** A new module copies `apps/server/modules/departments`.
7. **401 and 403 are different.** No session → 401. Valid session, missing permission → 403.
   A missing row is 404.

## Where to learn the rest

This file is deliberately thin: everything below is loaded on *every* request, so detail
belongs in the document that needs it.

- Module anatomy, request flow, folder shape → `docs/architecture.md`
- Code rules the gates enforce, including comment language → `docs/conventions.md`
- Clean checkout, env, first owner account → `docs/development.md`
- Test harness, PGlite vs Postgres → `docs/testing.md`
- Auth, authorization, audit, secrets → `docs/security.md`
- Logging, health, migrations, backup → `docs/operations.md`
- Deployment targets → `docs/deployment.md`
- Why decisions were made, and what was rejected → `docs/adr/`
- Task status → `docs/tasks/`

Commands, gates, and how to add a route or module: `bun erp --help`.
