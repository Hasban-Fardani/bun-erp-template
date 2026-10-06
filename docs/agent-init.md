# Agent startup

Run `bun erp init` from the repository root before code exploration or development. It is the single
door: it installs the chosen app combination from `templates/apps/` (numbered choice list, or
`--apps server,web --yes`; `--no-agents` skips the tooling below), runs the first `bun install`, then
pins and syncs the local CodeGraph index at the release in `gates/codegraph.ts`, wires the CodeGraph
MCP server into every detected agent (opencode included, normalized to opencode's real schema),
aligns an older global `codegraph` to the pinned release, and installs the required Matthew Pocock
and Petr Kindlmann QA skills when any are missing. Re-running it updates the index, repairs missing
skills, and re-fits a detached web/mobile shell once a server app exists. CI setup runs
`bun erp init --apps server,web --yes` on every job; `bun dev` does not. The index is local state
under `.codegraph/` and is ignored by Git.

For a nontrivial feature or architecture change, invoke `grill-me` before implementation and close
the open design decisions with the user. Read the relevant project skill and canonical docs before
editing. Use CodeGraph to locate and trace code first; use exact-text search after narrowing scope.

`bun erp check:agents` verifies every skill listed in `gates/agent-skills.ts`, that the pinned
CodeGraph CLI resolves and reports the pinned version, and that the index contains the entry files of
the installed apps (the server and web entries once those apps are installed; a missing app is not
required). QA browser work uses Playwright only; Cypress skills and Cypress test files
are outside the approved toolchain. `bun erp check` includes this gate. Initialize first when it
reports a missing skill, an unavailable or drifted CLI, or an index entry.

Tool versions are pinned in `gates/codegraph.ts` and `cli/tasks/init-agents.ts`. CodeGraph CLI reference:
[project quickstart](https://github.com/colbymchenry/codegraph/blob/main/site/src/content/docs/getting-started/quickstart.md).
The skills are vendored from [Matthew Pocock's skills repository](https://github.com/mattpocock/skills)
and [Petr Kindlmann's QA skills repository](https://github.com/petrkindlmann/qa-skills). Two skill
directories coexist and are not interchangeable: `skills/` holds this template's own skills (see
`skills/README.md`), while `.agents/skills/` holds the externally installed skills above. The QA
project context at `.agents/qa-project-context.md` records this repository's test stack and rules.
