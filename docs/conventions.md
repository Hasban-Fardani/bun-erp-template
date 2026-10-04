# Conventions

- Bun only; use exact dependency versions. Do not add a dependency when Bun or a Web Platform API fits.
- Strict TypeScript; add meaningful types and do not bypass contracts with any assertions.
- Comments explain why and use English. User-facing copy follows ui-copy.md and may be localized.
- Technical identifiers, configuration keys, enum values and API contract labels use English.
- Server features use route, validation, service, policy and schema files; add api/components/hooks/providers/stores/types only when useful to that feature.
- A service owns its transaction and transactional audit. Route code authorizes before validation and stays thin.
- API routes stay under /api/v1. Preserve the typed Hono route chain and generated OpenAPI coverage.
- Migrations are forward-only numbered TypeScript modules exporting up(database); never reset an applied ledger.
- Keep job handlers idempotent, use an idempotency key for repeatable side effects, and never store credentials in job payloads.
- Shared UI follows atomic design and the approved registry contract. See skills/ui-registry/SKILL.md.
- Add code to packages/utils only when two or more app workspaces share pure, runtime-neutral logic. See skills/cross-platform-utilities/SKILL.md.
- Logger redaction and audit field allowlists are separate safeguards; never log secrets.
- Node built-ins are restricted by tools/platform.ts; check the gate before adding one.

bun erp check runs lint, types and read-only gates concurrently. It does not run tests or builds.
Run bun erp test and the relevant app build when the change requires them.
