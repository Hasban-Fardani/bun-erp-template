# Repository skills

Load only the skill triggered by the task. Rules are implemented by source/gates where stated;
prose alone does not prove enforcement.

- `grill-me` and `grilling` (from `mattpocock/skills`): settle open design decisions before
  nontrivial implementation. Third-party skills are installed into `.agents/skills/` by
  `bun erp init` / `bun erp ai:update` and pinned in [skills-lock.json](../skills-lock.json);
  they are not tracked in git.

- [Feature development](feature-development/SKILL.md): feature boundaries and work order.
- [Database](database-drizzle/SKILL.md): Drizzle, migrations and driver parity.
- [Testing](testing/SKILL.md): shared fixtures and evidence.
- [UI](antislop-ui/SKILL.md): existing components, operator feedback, and the `bun erp check:gate motion` reduced-motion gate.
- [Responsive layout](antislop-layoutmobile/SKILL.md): viewport/touch/native checks.
- [Mobile development](mobile-development/SKILL.md): source ownership, API, logging and Capacitor release boundaries.
- [Guardrails](template-guardrails/SKILL.md): gate diagnosis and truthful handoff.
- [Shared utilities](cross-platform-utilities/SKILL.md): when code belongs in `packages/utils`.
- [Background jobs](background-jobs/SKILL.md): durable enqueue, retries and handler conventions.
- [UI registry](ui-registry/SKILL.md): inspect the approved shadcn source before changing atomic UI.
