---
name: template-guardrails
description: Use when working in the bun-erp-template repo, before claiming work is done. Lists the mistakes this repo has already paid for, so they are not repeated.
---

# Template guardrails

Every rule here was written after a real failure in this repo. Read it before reporting work
as finished.

## Never claim a file or capability exists without opening it

The largest class of wasted work. Real examples:

- A doc said "API and worker entrypoints — one app, two doors". There is no worker file. The
  claim had been copied between documents for months.
- A comment said "403 on `/me` = valid identity without permission". `requireActor` only ever
  throws 401. The client had a branch for an error that could not happen.

Before writing "the app has X", open the file. Before describing an endpoint's behaviour, read
the handler. `bun erp route:list` prints routes from the real app.

## Check that a class name or config key is actually live

`data-[state=open]:animate-in` looked correct and did nothing: the plugin providing
`animate-in` was never installed, so every drawer snapped open with no transition. Verify in
the built output:

```bash
bun run build
grep -o 'the-class-name' apps/web/dist/assets/*.css
```

A class that appears in JSX but not in the built CSS is dead code with a cost.

## The gate is right until proven otherwise

When a gate flags your code, do not reach for `slop-ok` or a config change first. Twice in this
repo the initial instinct was to silence a finding:

- a `NODE_BUILTIN` finding on a tool the author had just written — the finding was correct
- a `DUPLICATE_BLOCK` between two audit calls — after checking, the fields genuinely differed

One of those was real, one was a false positive, and only reading the code could tell them
apart. Exempt with `slop-ok: <reason>` only after checking, and write the reason:

```
// slop-ok: shape is identical because the helper centralises fixed fields; only the event
// name differs, and that is data, not duplicated logic.
```

## Prove a new gate fails before trusting it

A gate that has never failed is unverified. For every rule added:

1. break the condition deliberately
2. run the gate, confirm it reports the problem
3. restore, confirm it passes

A RED check that passes is the finding. This happened: a new rule used the rule name
`react-doctor/no-high-complexity-react-function`, but the JSON reports
`no-high-complexity-react-function`. The first RED check "passed" and proved nothing.

## Bun first, and `node:` is how that slips

`node:fs/promises` is the reflex, and it pulled 19 imports into a repo whose runtime is Bun.
Use `Bun.file`, `Bun.write`, `Bun.Glob`, `Bun.spawn`, `Bun.$`. `node:path` is the one accepted
exception because Bun has no path API — it is listed in `tools/platform.ts`, and anything not
on that list fails `bun erp check`.

## Do not write outside the repo's allowed directories

Research and scratch output goes in `docs/riset/`. A new top-level directory fails the scope
gate — including one created by a subagent. Tell any delegated task which directory to write to.

## A test that failed once is a bug in the test

One suite run failed at 5136ms against Bun's 5000ms default timeout, then passed on re-run. That
is a flake, and a flake in CI is a real defect. The timeout now lives in `bunfig.toml`.

## Report the layers you actually tested

`API_UNIT_TESTED` does not imply `UI_TESTED`. A `curl` returning 200 does not prove the UI
renders. If the browser was not opened, say so.
