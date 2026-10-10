---
id: S01
title: Enforced delivery flow and always-present agent skills
status: in_progress
tdd: required
evidence: pending — append the commands run and their results
---

> Living task. Human-owned status: an agent leaves this at `in_progress` with real evidence and
> never raises it to `ready` or `done` itself.

# S01 — Enforced delivery flow and always-present agent skills

## Flow

- [x] brainstorm: decisions below, settled with the user in chat (skills vanished from Claude Code; flow must be forced)
- [x] plan: five tickets in three waves, see Plan
- [x] design: docs/design/S01/ — system, database and pages are n/a (CLI tooling); flow.html
- [x] execute: five tickets red → green, evidence in each ticket
- [x] review: self-review of the diff plus gates — slop found two duplicate test blocks, the lifecycle test found a template-only id in issue-tracker.md, lint found formatting; the code-review skill was not run
- [x] iterate: reused support/temp-root.ts and a plan fixture, removed the id, formatted; lint clean, check exit 0, suite 636/638 with the 2 pre-existing failures

## Goal

Every agent session sees the required skills, and every piece of tracked work moves through
brainstorm → plan → design → execute → review → iterate, with `bun loom check` rejecting a skipped
or out-of-order phase.

## Decisions

1. Skills install into `.agents/skills` (Codex and compatible agents) and `.claude/skills` (Claude
   Code). The agents gate fails when either copy is missing; `bun loom ai:skills` restores them and
   a Claude Code SessionStart hook runs it and reloads skills.
2. The flow is mandatory for every owner task; there is no opt-in key. A ticket (`<owner>.<n>`)
   inherits its owner's flow.
3. Phase lines are `- [x] <phase>: <note>`, ticked in order; a ticked phase needs a note.
4. The design pack is `docs/design/<owner>/`: `system.md`, `database.md` and `pages.md` with their
   required headings (or a whole-file `n/a — <reason>`), `flow.html`, plus `database.html` and
   `pages.html` when those documents are not n/a.
5. No checkpoint is ticked and no ticket starts before the owner's design phase is ticked.
6. `depends_on` may point at an unstarted task while the dependent is unstarted too, so the whole
   ticket graph is written during planning; `bun loom task:plan` prints the parallel waves and the
   gate rejects cycles.
7. `ready` and `done` require all six phases ticked; execute requires every checkpoint ticked.
8. `.diagram-design` selects the default profile so the first-run style question never stalls an
   agent.

## Plan

```text
Wave 1 (parallel): S01.1 Skills in every agent directory · S01.2 Six-phase flow in the task gate
Wave 2 (parallel): S01.3 Ticket waves and scaffolds · S01.4 Claude Code hooks
Wave 3: S01.5 Agent instructions and docs
```

## Tickets

- [S01.1](S01.1-skills-in-every-agent-directory.md)
- [S01.2](S01.2-six-phase-flow-in-the-task-gate.md)
- [S01.3](S01.3-ticket-waves-and-scaffolds.md)
- [S01.4](S01.4-claude-code-hooks.md)
- [S01.5](S01.5-agent-instructions-and-docs.md)

## Evidence

- `bun run lint` — Checked 903 files, no fixes applied
- `bun loom check` — exit 0, 33 gates ok (agents, task, slop, scope, lifecycle, docs, biome, types …)
- `bun loom test` (repo, apps empty) — shared package suites 25 pass, 0 fail
- `bun loom test` (scratch copy with `apps/server` installed, disposable PostgreSQL 17 on 127.0.0.1:55419) — 636 pass, 2 fail: `about reports runtime versions…` and `features:install reads every name…`; both fail the same way on HEAD with only the server app installed (web app absent), so they are not from this change
