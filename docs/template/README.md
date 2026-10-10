# Template lifecycle material

This directory holds rules and decisions that apply only while this repository is the
**loom-template**. A fork that runs `bun loom project:adopt --name <name> --purpose "<one line>"`
deletes this whole directory, strips every `template-only` block and deletes `template.scope.json`,
so a project never reads template rules as project rules.

- [ADR-0006 — Capacity target](adr-0006-capacity.md): superseded; the current target is Cloudflare Workers Free.
- [ADR-0008 — Template distribution](adr-0008-template-distribution.md): copy/fork policy and what stays out of the template.
- [Scope notes](scope.md): the `template.scope.json` boundary and how `check:scope` behaves in each mode.

`docs/tasks/F3.*` is template-program work; `bun loom project:adopt` deletes it too. `docs/tasks/`
itself stays because the `task` gate and the evidence rule depend on it.
