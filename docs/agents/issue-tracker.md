# Issue tracker: docs/tasks

Project-owned. The engineering skills (`to-spec`, `to-tickets`, `implement`, `code-review`) do
**not** read this file: they say "run `/setup-matt-pocock-skills`" and default to GitHub issues,
`.scratch/` and the `ready-for-agent` label. `AGENTS.md` overrides that: whenever a skill asks for
the tracker or labels, follow this file. Work lives in `docs/tasks/` and is validated by
`bun loom check:gate task`.

## Mapping

| Skill vocabulary | This repository |
| --- | --- |
| `/setup-matt-pocock-skills`, "issue tracker not provided" | Never run it; this file is the configuration |
| Issue, spec issue, ticket issue | One markdown file `docs/tasks/<id>-<slug>.md`, created with `bun loom task:new` |
| Publish to the tracker, `.scratch/<slug>/issues/` | Write the file in `docs/tasks/`; never GitHub issues or `.scratch/` |
| `ready-for-agent` | `status: in_progress` (an agent may take it) |
| `needs-triage`, `needs-info` | `status: draft` (not started); `blocked` when waiting on a person |
| Issue number or URL argument | The task id, e.g. `S12.2` |
| Blocking edge or link | `depends_on:` plus the `## Blocked by` section |
| Close the issue | A human sets `ready` then `done`; agents stop at `in_progress` |

## Conventions

- One markdown file per spec and per ticket in `docs/tasks/`, created with
  `bun loom task:new <id> "<title>" [--depends-on <id,id>]` and then edited. Never create GitHub
  issues.
- A spec uses the id `S<NN>` (for example `S12`). Its tickets use `S<NN>.<n>` (`S12.1`, `S12.2`),
  numbered from 1, one file each, never a combined list. A ticket's checkpoints use
  `S<NN>.<n>.<m>`.
- An **owner** is a task whose parent id has no file (a spec, or a standalone task);
  it carries the delivery flow. A **ticket** is a task whose parent file exists; it inherits the
  owner's flow. `task:new` picks the scaffold from that rule.
- Front matter keys are `id`, `title`, `status`, `depends_on`, `evidence`, plus `tdd: required` (read
  `cli/gates/tasks.ts` for the rules). Agents write only `draft` or `in_progress`; `ready`, `done`
  and `approved_by` belong to a human.
- Tickets are tracer-bullet vertical slices (UI, API, database and test together), each demoable
  alone and cut to the smallest verifiable checkpoints. Describe behavior, not file paths, and use
  the vocabulary of `GLOSSARY.md`.
- Triage labels are not used; see the Mapping table.

## Spec file (owner, `to-spec`)

`bun loom task:new S12 "<title>"` writes the owner and scaffolds `docs/design/S12/` (`system.md`,
`database.md`, `pages.md`, each with its required headings). The owner starts `in_progress` with
this section, which `bun loom check:task` enforces:

```markdown
## Flow

- [x] brainstorm: three decisions settled, see Decisions
- [x] plan: four tickets in two waves, see Plan
- [ ] design:
- [ ] execute:
- [ ] review:
- [ ] iterate:
```

Phases tick in order, each with a note saying what it produced. Below it: `## Goal`, `## Decisions`
(the brainstorm outcome), the Problem Statement, Solution and user stories `to-spec` prescribes,
`## Plan` (the fenced `bun loom task:plan S12` output), a `## Tickets` list linking every
`S<NN>.<n>` file, and `## Evidence`.

What each ticked phase requires:

| Phase | Gate rule |
| --- | --- |
| plan | A `## Plan` section with content; at least one checkpoint in every ticket (or in the owner when it has no tickets) |
| design | `docs/design/<id>/` complete: every heading of `system.md`, `database.md` and `pages.md` has content, or the whole document is `n/a — <reason>`; `flow.html` exists, and `database.html` / `pages.html` exist unless their document is n/a. Draw them with `diagram-design` |
| execute | Every ticket has started and every checkpoint is ticked |
| all | `ready` and `done` need all six phases ticked |

Until design is ticked, no checkpoint may be ticked and no ticket may leave `draft`.

## Ticket file (`to-tickets`)

`bun loom task:new S12.2 "<title>" --depends-on S12.1` writes:

```markdown
---
id: S12.2
title: Approve an invoice from the list
status: draft
depends_on: S12.1
tdd: required
evidence: pending — append the commands run and their results
---

# S12.2 — Approve an invoice from the list

## What to build

## Acceptance criteria

## Blocked by

- S12.1

## Checkpoints

- [ ] **S12.2.1** Smallest verifiable step; tick it only after its red and green lines exist

## Evidence
```

Write the whole ticket graph during planning: a `draft` ticket may depend on another `draft`
ticket. A ticket may start (`in_progress`) only once its owner ticked design and every
`depends_on` target has started; a cycle fails the gate. `bun loom task:plan S12` groups the
tickets into waves, and every ticket in one wave can run in parallel.

## Working a ticket

`implement` takes a ticket id, reads `docs/tasks/<id>-*.md`, and works red then green (`tdd`).
Paste the failing and passing command output under `## Evidence`, tick the checkpoints actually
done, leave `status` at `in_progress`, and tell the human it is ready for review. When every
ticket's checkpoints are ticked, tick execute in the owner, then review and iterate.
