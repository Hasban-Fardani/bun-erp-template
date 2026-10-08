# Scope notes

While `docs/template/` exists this repository is the template, and `template.scope.json` bounds what
may be committed:

- `allowed.topLevelDirs` lists the directories the template owns.
- `forbidden.paths` names files that must never be committed (`.env*`, `.data`).
- `forbidden.patterns` rejects client names and client business vocabulary, with `allowIn`
  exceptions for documents that must name them.

`bun erp check:scope` reads Git-tracked files and applies that manifest. When a fork runs
`bun erp project:adopt`, the manifest is deleted, the repository is a project, and both the
`lifecycle` gate and `check:scope` stop applying template rules. Do not copy the manifest into a
project: the scope gate intentionally skips when it is absent.
