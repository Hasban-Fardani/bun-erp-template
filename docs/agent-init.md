# Agent startup

Run `bun erp init` from the repository root before code exploration or development. It pins and
syncs the local CodeGraph index, then installs the required Matthew Pocock and Petr Kindlmann QA
skills when any are missing. Re-running it updates the index and repairs missing skills;
development scripts and CI setup run it automatically. The index is local state under `.codegraph/`
and is ignored by Git.

For a nontrivial feature or architecture change, invoke `grill-me` before implementation and close
the open design decisions with the user. Read the relevant project skill and canonical docs before
editing. Use CodeGraph to locate and trace code first; use exact-text search after narrowing scope.

`bun erp check:agents` verifies every skill listed in `tools/agent-skills.ts` and that CodeGraph
contains the server, web, and mobile entry files. QA browser work uses Playwright only; Cypress
skills and Cypress test files are outside the approved toolchain. `bun erp check` includes this gate.
Initialize first when it reports a missing skill or index entry.

Tool versions are pinned in `scripts/init-agents.ts`. CodeGraph CLI reference:
[project quickstart](https://github.com/colbymchenry/codegraph/blob/main/site/src/content/docs/getting-started/quickstart.md).
The skills are vendored from [Matthew Pocock's skills repository](https://github.com/mattpocock/skills)
and [Petr Kindlmann's QA skills repository](https://github.com/petrkindlmann/qa-skills). The QA
project context at `.agents/qa-project-context.md` records this repository's test stack and rules.
