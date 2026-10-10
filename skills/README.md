# Repository skills

Load only the skill triggered by the task. Rules are implemented by source/gates where stated;
prose alone does not prove enforcement.

Delivery flow: every change walks brainstorm → plan → design → execute → review → iterate. The
skills are installed into `.agents/skills/` and `.claude/skills/` by `bun loom ai:skills` (also run
by `init`, `ai:update` and the Claude Code SessionStart hook), pinned in
[skills-lock.json](../skills-lock.json), not tracked in git. Tickets live in `docs/tasks/`, not
GitHub Issues: where a skill asks for a tracker, triage labels or `/setup-matt-pocock-skills`, use
the Mapping table in [docs/agents/issue-tracker.md](../docs/agents/issue-tracker.md); glossary and
ADRs are in [docs/agents/domain.md](../docs/agents/domain.md) (`GLOSSARY.md`, `docs/adr/`).

| Phase | Skills | Produces (ticked in the owner's `## Flow`) | Gate |
| --- | --- | --- | --- |
| 1. brainstorm | `grill-with-docs` (or `grill-me` / `grilling`), `domain-modeling` | Open decisions settled under `## Decisions`; glossary terms and ADRs | note required |
| 2. plan | `to-spec`, `to-tickets`, `bun loom task:new`, `bun loom task:plan` | One ticket per smallest vertical slice, each with checkpoints and `depends_on`; the waves under `## Plan` | plan section, a checkpoint per ticket, no cycle |
| 3. design | `diagram-design`, `impeccable`, `codebase-design` | `docs/design/<id>/`: `system.md` (design system), `database.md`, `pages.md`, `flow.html`, plus `database.html` and `pages.html` when those apply | every heading filled or whole-document n/a; diagrams present |
| 4. execute | `implement` with `tdd`, wave by wave | Red then green evidence per checkpoint | no ticket or checkpoint before design; every checkpoint ticked |
| 5. review | `code-review`; `bun run lint`, `bun loom check`, `bun loom test` | Standards and spec findings, gate results | note required |
| 6. iterate | `diagnosing-bugs` for failures | Findings fixed; execute and review repeated until clean | `ready`/`done` need all six phases |

Tickets in one wave run in parallel (one agent each when several are available); a ticket stays
`draft` until its owner ticks design and its `depends_on` tickets have started.

Autonomy: decide conventional or reversible choices yourself and state them in one line. Ask only
for product decisions, destructive actions or missing secrets, in one batched message. Run every
install, migration, gate, suite and local QA yourself. Task status, `approved_by`, secrets, live
third-party accounts, production deploys, repo settings and final visual sign-off are human-only.
The grilling skills settle open product decisions; they are not for confirming defaults or
questions the code and docs already answer.

Tool skills, installed the same way: `find-docs` and `context7-mcp` (`upstash/context7`) fetch
current library docs; `chrome-devtools`, `a11y-debugging`, `debug-optimize-lcp` and
`memory-leak-debugging` (`ChromeDevTools/chrome-devtools-mcp`) inspect a running page through the
Chrome DevTools MCP server that `init` wires for opencode. They debug; browser QA stays Playwright.
`bun loom init` also builds the CodeGraph index first (`--no-agents` skips all of this).

- [Feature development](feature-development/SKILL.md): feature boundaries and work order.
- [Database](database-drizzle/SKILL.md): Drizzle, migrations and driver parity.
- [Testing](testing/SKILL.md): shared fixtures and evidence.
- [UI](antislop-ui/SKILL.md): existing components, operator feedback, and the `bun loom check:gate motion` reduced-motion gate.
- [Responsive layout](antislop-layoutmobile/SKILL.md): viewport/touch/native checks.
- [Mobile development](mobile-development/SKILL.md): source ownership, API, logging and Capacitor release boundaries.
- [Guardrails](handoff-guardrails/SKILL.md): gate diagnosis and truthful handoff.
- [Shared utilities](cross-platform-utilities/SKILL.md): when code belongs in `packages/utils`.
- [Background jobs](background-jobs/SKILL.md): durable enqueue, retries and handler conventions.
- [UI registry](ui-registry/SKILL.md): inspect the approved shadcn source before changing atomic UI.
