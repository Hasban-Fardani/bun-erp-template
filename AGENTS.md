# Agent guide

Bun + TypeScript template: Hono, Drizzle/PostgreSQL, React web and Capacitor packaging.
No client business rules or product data. Use Bun for runtime and package management.

## Start here

Read [docs/README.md](docs/README.md) to select context; do not load every doc or research log.
Code and package manifests describe what exists. ADRs describe decisions, including plans.
Tasks and research record past evidence; they are not current instructions.

## Required boundaries

- New server modules copy `apps/server/modules/departments`; do not invent another architecture.
- Organization comes from server context. No session → 401; missing permission → 403; missing row → 404.
- Transactions live in services. Authorization precedes validation; error fields remain an array.
- Do not weaken gates, skip assertions, commit secrets or invent data/measurements.
- Add dependencies only when Bun/Web APIs cannot serve the requirement; pin exact versions.
- Only humans set tasks to `ready` or `done`; agent work stops at `in_progress` with evidence.

## Context to load

| Change | Read first |
|---|---|
| Any code | [conventions](docs/conventions.md) |
| HTTP/module | [architecture](docs/architecture.md), [API contract](docs/api-contract.md), [module skill](skills/module-development/SKILL.md) |
| Query/migration | [database skill](skills/database-drizzle/SKILL.md) |
| Auth/audit/log | [security](docs/security.md) |
| Tests | [testing](docs/testing.md), [test skill](skills/testing/SKILL.md) |
| UI | [UI skill](skills/antislop-ui/SKILL.md); responsive changes also [mobile layout](skills/antislop-layoutmobile/SKILL.md) |
| Native packaging | [mobile](docs/mobile.md) |
| Deployment | [operations](docs/operations.md), [deployment](docs/deployment.md) |
| Architecture decision | Relevant [ADR](docs/adr/README.md); retain rejected alternatives |

## Handoff

Run `bun erp check` and `bun erp test`; report actual exit codes and limitations.
Check runs read-only lint, types and gates concurrently and reports every failure.
Use `bun erp --help` for available commands.
Read [template guardrails](skills/template-guardrails/SKILL.md) before reporting completion.
Evidence levels: IMPLEMENTATION_DONE → API_UNIT_TESTED → UI_TESTED → READY_FOR_USE.
Unexecuted work is NOT_RUN; unmet prerequisites are BLOCKED. Native device testing is distinct from browser QA.
