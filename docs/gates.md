# Gates

A gate is a read-only check under `cli/gates/`. It inspects repo files and returns findings; it never
writes to the repo, runs tests, or builds anything. `bun erp check` runs Biome, TypeScript and every
gate and fails when any returns a finding. A gate can also run alone.

`cli/lib/gates.ts` holds `GATE_CATALOG`, the single source of truth: each entry has a name, a
standalone command, the implementing file, and a one-sentence summary. `bun erp check:gate --list`
prints that catalog as a table.

## How the chain works

1. `cli/gates/<name>.ts` implements the check and returns findings (a typed array or `string[]`).
2. `cli/lib/gates.ts` defines `GATE_CATALOG` and `GATE_IMPLEMENTATIONS`, the catalog-keyed dispatch
   map every standalone command uses through `runGate`. A catalog entry without an implementation is
   a type error, so a gate can never silently fall through to another gate's runner.
3. `cli/gates/parallel-gates.ts` derives the `check` job list from the catalog in catalog order and
   runs the pure gates in-process through `collectGateFindings`; only gates whose implementation
   shells out to another binary (`impeccable`, `react`, `readiness`, `scope`, `slop`) stay in a child
   process. `check:fast` runs the file-level subset named in `FAST_GATE_NAMES`.
4. `cli/commands/check.ts` registers the `check:*` commands and `check:gate`; `check:gate <name>`
   looks the command up in the catalog and forwards any extra arguments.
5. `bun erp check` runs Biome, `tsc` and all 25 gates (up to eight at a time); `bun erp check:fast`
   skips the typecheck, the React audit and the slower gates for the inner loop. Neither runs tests
   or builds — use `bun erp test` and the app build for those.

## Gate catalog

`bun erp check:gate --list` is authoritative; this table explains the same entries.

Since `apps/` ships empty, the UI gates (`design`, `copy`, `motion`, `ui`, and the contrast half of
`design`) also scan the catalog copies under `templates/apps/web`, `templates/apps/mobile`,
`templates/features/*/web` and `templates/packages/*/src`; a directory that does not exist is
skipped. `check:design` reads `cli/gates/design-exemptions.json` for documented known gaps (one
screen and reason per entry); a missing or malformed exemptions file is itself a finding.

| Gate | Command | File | What it checks | When it skips |
|---|---|---|---|---|
| agents | `check:agents` | `cli/gates/agent-readiness.ts` | Required agent skills, the pinned CodeGraph CLI and a complete local index | Installed app entries only; a missing app is not required |
| architecture | `check:architecture` | `cli/gates/architecture-guard.ts` | UI atomic-layer imports, app isolation and page-wrapper rules | Missing app, screen or package source directories |
| ci | `check:ci` | `cli/gates/ci-guard.ts` | Required CI jobs, the init step and `docs/ci.md` | Never |
| copy | `check:copy` | `cli/gates/copy-guard.ts` | Rendered copy for infrastructure vocabulary and deployment names | Missing web or mobile source |
| design | `check:design` | `cli/gates/design-gate.ts` + `cli/gates/contrast-gate.ts` | A direction spec for every screen, theme-token contrast, component class contrast | Missing web or mobile screen directories |
| docs | `check:docs` | `cli/gates/docs-guard.ts` | Relative Markdown links resolve; every package has a matching `llms.txt` | Never |
| impeccable | `check:impeccable` | `cli/gates/impeccable.ts` | The pinned Impeccable design detector reports 0 anti-pattern findings on every UI surface | UI directories that are not installed |
| language | `check:language` | `cli/gates/language-guard.ts` | Indonesian identifiers and technical enum values in first-party source | Never; it scans the directories that exist |
| migrations | `check:migrations` | `cli/gates/migrations.ts` | Migration modules are named `NNNN_snake_case.ts` | `apps/server` is not installed |
| mobile | `check:mobile` | `cli/gates/mobile-gate.ts` | Capacitor version pin, entry files, offline SQLite encryption, release workflow | `apps/mobile` is not installed |
| motion | `check:motion` | `cli/gates/motion-gate.ts` | Inline keyframes and looping animations without a reduced-motion escape | `packages/ui/src/styles.css` is missing |
| package-targets | `check:package-targets` | `cli/gates/package-targets.ts` | Multi-target packages keep source under `src/<target>/` | Packages without `src/` |
| platform | `check:platform` | `cli/gates/platform.ts` | Node built-ins need a per-file exemption; Bun-first runtime | Web Vite tooling and vendored `cli/gates/governance/` are excluded |
| react | `check:react` | `cli/gates/react-doctor.ts` | React Doctor errors and high-complexity components | Missing `package.json` in web, mobile or UI |
| readiness | `check:prod` | `cli/gates/readiness.ts` | Root scripts, secret placeholders, migration numbering and contract docs | Missing migration or app directories |
| rpc | `check:rpc` | `cli/gates/rpc-guard.ts` | Typed Hono client, no runtime server imports, `/api/v1` prefix | Missing web, mobile or server apps; without a server there is no typed-client rule |
| scope | `check:scope` | `cli/gates/scope.ts` | Client names, business rules and unknown top-level directories | Never; it reads Git-tracked files |
| shadcn | `check:shadcn` | `cli/gates/shadcn-guard.ts` | Approved registries, vendored provenance and banned native controls | Missing app source directories |
| skills | `skills:validate` | `cli/gates/skills.ts` | `SKILL.md` frontmatter, matching name, trigger description and body length | `skills/` is missing |
| slop | `check:slop` | `cli/gates/slop.ts` | Narrative comments, oversized page components, governance AST slop | Missing scan targets; a missing bundled validator is a finding |
| surface | `check:surface` | `cli/gates/interactive-surface.ts` | Inline alerts outside the reviewed allowlist | Missing web or mobile source |
| task | `check:task` | `cli/gates/tasks.ts` | Task front matter, dependencies and evidence for `ready`/`done` | `docs/tasks/` is missing |
| tdd | `check:tdd` | `cli/gates/tdd.ts` | Every server feature has a test under `tests/features/<name>/` | No server features exist |
| ui | `check:ui` | `cli/gates/ui-completeness.ts` | List states, visible focus, a working theme switch | Missing screen directories; the theme check needs `apps/web/src/config/ui.ts` |
| versioning | `check:versioning` | `cli/gates/versioning.ts` | Root and workspace package versions match | Workspaces without a `package.json` |

## Run one gate

```sh
bun erp check:gate --list      # the catalog table
bun erp check:gate tdd         # forwards to check:tdd
bun erp check:tdd              # the standalone command, same gate
```

Arguments after the gate name are forwarded to the underlying command; no current gate consumes
them.

## Add a gate

1. Write `cli/gates/<name>.ts` exporting an async function that returns findings. Keep it read-only
   and report paths relative to the repo root; it must not import `cli/tasks/` or `apps/**`.
2. Add an entry to `GATE_CATALOG` in `cli/lib/gates.ts` (`name`, `command`, `file`, `summary`) and
   its implementation to `GATE_IMPLEMENTATIONS`; TypeScript fails the build until both exist.
   `bun erp check` picks it up automatically in catalog order.
3. Register the standalone command in `cli/commands/check.ts` with `guard(...)` and
   `runGate("<name>")`, or forward an existing command.
4. Add the name to `FAST_GATE_NAMES` in `cli/gates/parallel-gates.ts` only when the check is
   file-level and fast enough for the inner loop.
5. Add the table row above. If the rule is enforceable, state it in `AGENTS.md` or
   `docs/conventions.md` as well.
6. Test it: a unit test under `apps/server/tests/unit/` (or the catalog copy
   `templates/apps/server/tests/unit/`), then run `bun erp check:gate <name>`, `bun erp check:fast`
   and `bun erp check`.
