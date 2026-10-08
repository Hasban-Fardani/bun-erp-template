# Issue tracker: docs/tasks

Project-owned. The engineering skills (`to-spec`, `to-tickets`, `implement`, `implement-spec`,
`code-review`) read this file instead of using GitHub Issues or `.scratch/`. Work lives in
`docs/tasks/` and is validated by `bun erp check:gate tasks`.

## Conventions

- One markdown file per spec and per ticket in `docs/tasks/`, created with
  `bun erp task:new <id> "<title>"` and then edited. Never create GitHub issues.
- A spec uses the id `S<NN>` (for example `S12`). Its tickets use `S<NN>.<n>` (`S12.1`, `S12.2`),
  numbered from 1, one file each, never a combined list.
- Front matter keys are exactly `id`, `title`, `status`, `depends_on`, `evidence` (read
  `cli/gates/tasks.ts` for the rules). Agents write only `draft` or `in_progress`; `ready`, `done`
  and `approved_by` belong to a human.
- Tickets are tracer-bullet vertical slices (UI, API, database and test together), each demoable
  alone. Describe behavior, not file paths, and use the vocabulary of `GLOSSARY.md`.
- Triage labels are not used. `in_progress` means an agent may take it; `draft` means not started.

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
