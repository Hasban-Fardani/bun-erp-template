# Repository skills

Load only the skill triggered by the task. Rules are implemented by source/gates where stated;
prose alone does not prove enforcement.

Planning-to-delivery flow (`mattpocock/skills`, installed into `.agents/skills/` by
`bun erp init` / `bun erp ai:update`, pinned in [skills-lock.json](../skills-lock.json), not
tracked in git). Tickets live in `docs/tasks/`, not GitHub Issues; the config is
[docs/agents/issue-tracker.md](../docs/agents/issue-tracker.md) and
[docs/agents/domain.md](../docs/agents/domain.md) (`GLOSSARY.md`, `docs/adr/`).

1. `grill-with-docs` (or `grill-me` / `grilling`): settle open product decisions; it writes
   glossary terms and ADRs through `domain-modeling`.
2. `to-spec`: synthesize the conversation into a spec task file.
3. `to-tickets`: split the spec into tracer-bullet tickets, one `docs/tasks/S<NN>.<n>-*.md` each,
   `depends_on` for blockers, status `draft` or `in_progress` only.
4. `implement` (calls `tdd`) per ticket: red, green, evidence under `## Evidence`.
5. `code-review`: standards and spec review; then a human moves the status.
6. `diagnosing-bugs` for failures and regressions; `codebase-design` for module seams.

Autonomy: decide conventional or reversible choices yourself and state them in one line. Ask only
for product decisions, destructive actions or missing secrets, in one batched message. Run every
install, migration, gate, suite and local QA yourself. Task status, `approved_by`, secrets, live
third-party accounts, production deploys, repo settings and final visual sign-off are human-only.
The grilling skills settle open product decisions; they are not for confirming defaults or
questions the code and docs already answer.

- [Feature development](feature-development/SKILL.md): feature boundaries and work order.
- [Database](database-drizzle/SKILL.md): Drizzle, migrations and driver parity.
- [Testing](testing/SKILL.md): shared fixtures and evidence.
- [UI](antislop-ui/SKILL.md): existing components, operator feedback, and the `bun erp check:gate motion` reduced-motion gate.
- [Responsive layout](antislop-layoutmobile/SKILL.md): viewport/touch/native checks.
- [Mobile development](mobile-development/SKILL.md): source ownership, API, logging and Capacitor release boundaries.
- [Guardrails](handoff-guardrails/SKILL.md): gate diagnosis and truthful handoff.
- [Shared utilities](cross-platform-utilities/SKILL.md): when code belongs in `packages/utils`.
- [Background jobs](background-jobs/SKILL.md): durable enqueue, retries and handler conventions.
- [UI registry](ui-registry/SKILL.md): inspect the approved shadcn source before changing atomic UI.
