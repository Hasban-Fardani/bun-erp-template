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

## Sample widely before calling a pattern "the standard"

Measuring eight login pages and concluding "centred card is the norm" was wrong: the eight were
the ones I already knew, and they happened to share a shape. `ui.shadcn.com/blocks/login` alone
ships five variants, two of them two-column. A conclusion drawn from a convenience sample is a
conclusion about the sample, not about the field.

Before generalising: browse a catalogue, not a memory. shadcn blocks, shadcnblocks, 21st.dev.
Name how many variants exist and which one you chose, and why.

## A secret or an internal command never belongs on a pre-auth page

The login screen once printed `bun erp user:passwd` as the recovery instruction. Anyone who loads
that page — before authenticating — learns the tooling, the user model, and that password resets
need shell access.

Pre-auth surfaces leak by nature. Before shipping text on one, ask what it tells someone with no
account. Recovery copy states who to contact, not what command to run.

## Do not ship a state message that only ever reports good news

A status strip that always reads "API active / database ready" is decoration: it cannot change a
decision, and it competes with the primary action. The same information is worth showing only when
it is bad, because then it explains a failure the user is about to hit.

Rule: if a component can only say "everything is fine", delete it.

## Verify colour claims with a contrast function, not with an impression

Screenshots mislead about colour and spacing. A vision pass reported a 2.1:1 helper contrast that
measured 7.3:1, a 2.6:1 icon that measured 4.8:1, and column gaps of 167/520 that measured 176/176.
Each wrong claim would have caused a real regression if acted on.

Measure computed styles in the browser and compute the ratio arithmetically. Screenshots are for
finding candidates, never for confirming them.

## The operator is not a technician

A screen said "API aktif / Basis data siap" and "Memuat sesi…" and "izin audit.read". The person
using this tool approves orders; none of that vocabulary helps them decide anything, and each
string costs attention they owe to their work.

Screen text is judged by one question: **what decision can this text change?** A badge reading
`Disetujui` changes whether they proceed. A badge reading `API aktif` changes nothing, ever — so
it is decoration, and decoration that competes with the primary action.

Two rules that settle most cases:

- If a status element can only ever report good news, delete it. It cannot go red in a way the
  operator can act on.
- Never name a permission identifier (`user.read`). Name who can do the thing instead.

`bun erp check:copy` enforces this on rendered strings only — identifiers, imports, and comments
are not user-facing, so flagging them would train everyone to ignore the gate.

## A rule nothing runs is documentation

`design-direction-validator.ts` sat in the governance repo with 20+ measured rules, including the
one banning `muted-subtitle-under-headline`. Nothing called it, so this repo shipped that exact
violation twice while the rule sat one directory away.

When a governance rule exists, wire it into `bun erp check` in the same change. Before that, the
only thing enforcing it is the owner's patience.
