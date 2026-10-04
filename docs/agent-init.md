# Agent startup

Run `bun erp init` from the repository root before code exploration or development. It pins and
syncs the local CodeGraph index, then installs only Matthew Pocock's `grill-me` and `grilling`
skills when either is missing. Re-running it updates the index; development scripts and CI setup
run it automatically. The index is local state under `.codegraph/` and is ignored by Git.

For a nontrivial feature or architecture change, invoke `grill-me` before implementation and close
the open design decisions with the user. Read the relevant project skill and canonical docs before
editing. Use CodeGraph to locate and trace code first; use exact-text search after narrowing scope.

`bun erp check:agents` verifies that both skills exist and that CodeGraph contains the server, web,
and mobile entry files. `bun erp check` includes this gate. Initialize first when it reports a missing
skill or index entry.

Tool versions are pinned in `scripts/init-agents.ts`. CodeGraph CLI reference:
[project quickstart](https://github.com/colbymchenry/codegraph/blob/main/site/src/content/docs/getting-started/quickstart.md).
The skills are vendored from [Matthew Pocock's skills repository](https://github.com/mattpocock/skills).
