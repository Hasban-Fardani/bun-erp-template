# Issue tracker: docs/tasks

Project-owned. The engineering skills (`to-spec`, `to-tickets`, `implement`, `code-review`) do
**not** read this file: they say "run `/setup-matt-pocock-skills`" and default to GitHub issues,
`.scratch/` and the `ready-for-agent` label. `AGENTS.md` overrides that: whenever a skill asks for
the tracker or labels, follow this file. Work lives in `docs/tasks/` and is validated by
`bun erp check:gate task`.

## Mapping

| Skill vocabulary | This repository |
| --- | --- |
| `/setup-matt-pocock-skills`, "issue tracker not provided" | Never run it; this file is the configuration |
| Issue, spec issue, ticket issue | One markdown file `docs/tasks/<id>-<slug>.md`, created with `bun erp task:new` |
| Publish to the tracker, `.scratch/<slug>/issues/` | Write the file in `docs/tasks/`; never GitHub issues or `.scratch/` |
| `ready-for-agent` | `status: in_progress` (an agent may take it) |
| `needs-triage`, `needs-info` | `status: draft` (not started); `blocked` when waiting on a person |
| Issue number or URL argument | The task id, e.g. `S12.2` |
| Blocking edge or link | `depends_on:` plus the `## Blocked by` section |
| Close the issue | A human sets `ready` then `done`; agents stop at `in_progress` |

## Conventions

- One markdown file per spec and per ticket in `docs/tasks/`, created with
  `bun erp task:new <id> "<title>"` and then edited. Never create GitHub issues.
- A spec uses the id `S<NN>` (for example `S12`). Its tickets use `S<NN>.<n>` (`S12.1`, `S12.2`),
  numbered from 1, one file each, never a combined list.
- Front matter keys are `id`, `title`, `status`, `depends_on`, `evidence`, plus `tdd: required` (read
  `cli/gates/tasks.ts` for the rules). Agents write only `draft` or `in_progress`; `ready`, `done`
  and `approved_by` belong to a human.
- Tickets are tracer-bullet vertical slices (UI, API, database and test together), each demoable
  alone. Describe behavior, not file paths, and use the vocabulary of `GLOSSARY.md`.
- Triage labels are not used; see the Mapping table.

## Spec file (`to-spec`)

Front matter as above with `status: in_progress`. Body: the Problem Statement, Solution and
user-story sections the skill prescribes, then a `## Tickets` list linking `S<NN>.<n>` files.

## Ticket file (`to-tickets`)

```markdown
---
id: S12.2
title: Approve an invoice from the list
status: draft
depends_on: S12.1
evidence: pending — append the commands run and their results
---

# S12.2 — Approve an invoice from the list

## What to build

## Acceptance criteria

## Blocked by

- S12.1

## Checkpoints

- [ ] Failing test written first (red) and its output recorded
- [ ] Implementation makes the same test pass (green)
- [ ] `bun erp check` green
- [ ] Evidence recorded below

## Evidence
```

Blocking rule: the tasks gate rejects a `depends_on` that points at a `draft` or `blocked` task.
So the first unblocked ticket is `in_progress`; every later ticket stays `draft`, lists its
blockers under "Blocked by", and gains the `depends_on:` line only once all blockers are
`in_progress`. When you start a ticket, set it to `in_progress` and then add the line.

## Working a ticket

`implement` takes a ticket id, reads `docs/tasks/<id>-*.md`, and works red then green (`tdd`).
Paste the failing and passing command output under `## Evidence`, tick the checkpoints actually
done, leave `status` at `in_progress`, and tell the human it is ready for review.
