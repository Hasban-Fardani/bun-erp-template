# Conventions

- Bun only; use exact dependency versions. Do not add a dependency when Bun or a Web Platform API fits.
- Strict TypeScript; add meaningful types and do not bypass contracts with any assertions.
- Comments explain why and use English. User-facing copy follows ui-states.md and may be localized.
- Technical identifiers, configuration keys, enum values and API contract labels use English.
- Server features use route, validation, service, policy and schema files; add api/components/hooks/providers/stores/types only when useful to that feature.
- A service owns its transaction and transactional audit. Route code authorizes before validation and stays thin.
- `make:feature` emits optimistic locking by default; soft delete is opt-in (`--soft-delete`) and only for master data that history references — never for append-only or high-volume tables (logs, events, jobs, notifications, sessions, join tables).
- Validate `:id` path params with the shared `idParam` schema (`http/helpers/params.ts`); a malformed uuid is a 422, never a database 500.
- API routes stay under /api/v1. Preserve the typed Hono route chain and generated OpenAPI coverage.
- Migrations are forward-only numbered TypeScript modules exporting up(database); never reset an applied ledger.
- Keep job handlers idempotent, use an idempotency key for repeatable side effects, and never store credentials in job payloads.
- Shared UI follows atomic design and the approved registry contract. See skills/ui-registry/SKILL.md.
- Add code to packages/utils only when two or more app workspaces share pure, runtime-neutral logic. See skills/cross-platform-utilities/SKILL.md.
- Logger redaction and audit field allowlists are separate safeguards; never log secrets.
- Node built-ins are restricted by cli/gates/platform.ts; check the gate before adding one.
- `cli/gates/` holds read-only gates and governance checks; `cli/tasks/` holds helpers the CLI invokes. Both are TypeScript, but a gate never mutates the repo and a task is never imported by a gate. See docs/gates.md.

## Imports

Pick the import form by what it targets, in this order:

| Target | Form | Example |
|---|---|---|
| A workspace package | `@bun-erp/<name>` | `import { Button } from "@bun-erp/ui/atoms/button.tsx";` |
| Server module or server test | `@/*` → `apps/server/*` | `import { rowsOf } from "@/database/rows.ts";` |
| Web app or catalog feature web file | `@web/*` → `apps/web/src/*` | `import { rpc } from "@web/lib/rpc.ts";` |
| Mobile app | `@mobile/*` → `apps/mobile/src/*` | `import { createMobileLogger } from "@mobile/lib/logger.ts";` |
| The root CLI from a server command, task or test | `@cli/*` → `cli/*` | `import { repoRoot } from "@cli/lib/repo.ts";` |
| A file in the same directory | `./sibling.ts` | `import { useTableState } from "./use-table-state.ts";` |

Never stack two or more `../` segments: a path that walks up two or more directories hides which
module owns the target and breaks when a file moves. Use the alias for the layer instead. The
`architecture` gate's `no-deep-relative` rule (`NO_DEEP_RELATIVE`) fails any import specifier with
three or more `../` segments, so the migration cannot regress. The root `tsconfig.json` and
`templates/apps/server/tsconfig.json` declare the aliases, so `tsc -p tsconfig.json` and Bun resolve
them identically; `apps/web/vite.config.ts` and `apps/mobile/vite.config.ts` repeat `@web` and
`@mobile` for Vite.

bun erp check runs lint, types and read-only gates concurrently. It does not run tests or builds.
Run bun erp test and the relevant app build when the change requires them.

## Bun-first

The problem is sync IO and repeated tree scans, not the `node:` prefix. `bun-first`
(`cli/gates/bun-first.ts`) scans `cli/**`, `templates/apps/server/**` and `packages/**` and fails the
banned imports below; `templates/apps/web/**` (browser code) and the Worker graph are exempt.

| Import | Verdict | Reason |
|---|---|---|
| `node:path` | Keep | Bun has no path API, and Bun's `node:path` is native; swapping it gains nothing. |
| `node:url` | Keep | No Bun replacement for file-URL/path conversion. |
| `node:os` (`homedir`, `tmpdir`) | Keep | No Bun equivalent (`Bun.env.HOME` is not portable to Windows). |
| `node:fs/promises` `mkdir`/`rm`/`mkdtemp`/`stat`/`readdir` | Keep | Bun docs recommend `node:fs` for directory operations; `Bun.file`/`Bun.write` do not cover them. |
| `node:fs` sync (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `statSync`) | Ban | Blocks the event loop; use `Bun.file().text()/.exists()`, `Bun.write`, `Bun.Glob().scan()`. |
| `node:child_process` | Ban | Use `Bun.spawn` through `cli/lib/repo.ts#run`; keep `Bun.$` for one-line shell use. |
| `node:crypto` `randomUUID`/`createHash` | Ban | `crypto.randomUUID()` and `Bun.CryptoHasher` are built in. |
| `node:util` `promisify` | Ban | Bun APIs are already async. |
| `node-fetch`, `dotenv`, `glob`, `fast-glob`, `execa`, `cross-spawn` | Ban | Bun ships `fetch`, `.env` loading, `Bun.Glob` and `Bun.spawn`. |

Gates share one memoized async `Bun.Glob` scan per root per process (`cli/lib/file-index.ts`), so
parallel gates never re-walk the same tree and never block each other with sync IO. The vendored
governance validators under `cli/gates/governance/` keep their sync IO on purpose: they stay
verbatim for upstream re-sync, and `cli/gates/slop.ts` runs them in a Worker thread
(`governance/slop-worker.ts`) so that IO never touches the gate event loop.

## App catalog

Apps install from `templates/apps/<server|web|mobile>/` through `bun erp init` (an interactive
numbered choice list, or `bun erp init --apps server,web --yes` in scripts and CI) or through
`bun erp apps:create <name> <server|web|mobile>` later. `init` is the single door: it copies the
catalogs, registers the root `workspaces`, runs the first `bun install`, and installs the agent
tooling unless `--no-agents`. Full flow: [development](development.md).

Catalog apps keep their real package names, so `init` lands `@bun-erp/server`, `@bun-erp/web` and
`@bun-erp/mobile` at their reference paths. Web and mobile bind the server's typed Hono contract when
the server app exists; without it they install detached (`src/lib/rpc.ts` stub, no `@bun-erp/server`
dependency) and a later `init` that adds the server re-fits the typed client. Server- and
database-facing CLI commands live in `apps/server/cli/commands/`; the registry discovers them only
while the server app is installed, and root `cli/` — its gates included — never imports `apps/**`.

## Feature catalog

Features that are not part of the default install wait in `templates/features/<name>/`.
`bun erp features:install <name>` reads the feature's `feature.json`, copies its files into
`apps/*`, wires the sidebar entry and the `en-US`/`id-ID` keys, and regenerates the web route tree.
A manifest is one of two kinds:

- `server` (default) ships a server module, its test, web files, page and design spec, and also
  wires the permission statements, the audit snapshot allowlist and the `FEATURES` route mount.
  `departments` is the reference server feature.
- `web` ships presentation only — web files, page, design spec, navigation and i18n. The API,
  permissions and audit trail are core (`identity`, `rbac`, `audit`), so nothing server-side is
  wired. `users`, `roles` and `audit` are the reference web features.
- `infra` ships server infrastructure — it copies app-side wiring files and edits the composition
  root named by its `wiring` operations (`context.ts`, `bootstrap.ts`, jobs, channel registry, or
  the Better Auth plugin/schema/session/export anchors). It may install a catalog package and ship a
  forward-only migration, and has no routes, permissions, audit, navigation or i18n. `mail` is the
  package-installing reference: the default server keeps only the database notification channel, and
  `bun erp features:install mail` brings back the `@bun-erp/mail` transport. `organizations` is the
  Better Auth reference: `bun erp features:install organizations` adds the opt-in tenant layer
  (organization plugin, tables and session field) without adding routes or permissions.

A web feature may declare `requires` catalog packages; the installer installs them and adds the
`@bun-erp/<name>` workspace dependency to `apps/web` before writing any file. An infra feature adds
its package dependency to `apps/server` instead and may leave `requires` empty when it only wires
core files. Shared table helpers
(`use-table-state.ts`, `resource-table-labels.ts`) live once under `templates/features/_shared/web/`
and are declared in each manifest's `files.shared`; the installer copies them into
`apps/web/src/lib/` and skips them when already present. The installer refuses to overwrite an
installed feature. See `templates/features/README.md` for the full manifest contract.

The default install ships the core server modules `identity`, `rbac`, `audit` and
`notifications`, and a web app that is login, overview and notifications only. Admin screens are
opt-in: `bun erp features:install users roles audit`. Mail is opt-in too:
`bun erp features:install mail`.

## Where code goes

Check this table before creating a file; it resolves the boundaries that are otherwise ambiguous.

| You are adding | Put it in | Not in |
|---|---|---|
| A new web route | `apps/web/src/pages/_authenticated/<name>.tsx` (thin wrapper) and a row in `apps/web/src/config/navigation.ts` | logic inside the route file |
| A web screen | `apps/web/src/features/<feature>/screens/<name>.tsx` | `pages/` or `lib/` |
| Feature API, hooks, components, types | `apps/web/src/features/<feature>/{api,hooks,components,types}` | `lib/` |
| Cross-feature infrastructure (RPC client, auth, query client, theme, table state) | `apps/web/src/lib/` | a feature folder |
| App config and browser keys | `apps/web/src/config/` (`env.ts`, `storage-keys.ts`, `navigation.ts`, `ui.ts`) | inline `import.meta.env` or storage literals |
| A mobile screen | `apps/mobile/src/screens/<name>.tsx` in the catalog app (`bun erp init` or `bun erp apps:create <name> mobile`), wired in `apps/mobile/src/main.tsx` (mobile has no router) | a `pages/` directory |
| A mobile feature | `apps/mobile/src/features/<feature>/{components,stores}` | web source |
| A server feature | `apps/server/features/<feature>/{route,validation,service,policy,schema}.ts`; add feature-specific modules only when used | permission strings inline in `route.ts` — use `policy.ts` |
| Server infrastructure | `apps/server/infra/<concern>/` | `features/` |
| HTTP transport (middleware, errors, docs) | `apps/server/http/` (`helpers/` holds authorize, validate, errors, docs and list helpers) | `features/` |
| Route assembly and version prefix | `apps/server/routes/api.ts` | `http/` |
| A migration or seeder | `apps/server/database/migrations/NNNN_name.ts` or `apps/server/database/seeders/<name>.ts` | feature folders |
| Shared UI | `packages/ui`, following atoms → molecules → organisms → templates | an app |
| A new data table | the `data-table` catalog package (`bun erp packages:install data-table`) | `packages/ui` |
| Charts | `@bun-erp/charts` from the opt-in catalog (lazy, runtime-isolated) | `packages/ui` |
| Pure logic shared by two or more apps | `packages/utils` | an app's `lib/` |
| Localization copy | `packages/i18n/src/utils/messages/` | app components |
| An app unit test | `apps/<app>/tests/unit/<name>.test.ts` | beside the source |
| A server HTTP round-trip test | `apps/server/tests/features/<feature>/<feature>.test.ts` | `tests/unit/` |

Two names look similar but are not interchangeable; choose deliberately:

- `@bun-erp/ui/atoms/button.tsx` is the app-facing button; `atoms/button-primitives.tsx` is the
  complete shadcn primitive. Import a `*-primitives` module only when you need the upstream API.
- Prefer `Dialog` (controlled overlay) and `Sheet` (side panel) for new overlays.
  `organisms/modal.tsx` predates them and stays only where it is already used.

## Package targets

A package that serves more than one runtime splits its source by target under `src/<target>/`:
`ui` (browser and React), `server` (Bun, Hono, Postgres, Drizzle, Cloudflare), `capacitor` (native
plugins), or `utils` (runtime-neutral, shared by every side). `src/index.ts` (the barrel) and
`src/styles.css` stay at the root; every other source file belongs to a target directory. A package
with a single target stays flat, and a flat UI or server package may keep `utils` helpers beside its
dominant files. `storage` is the reference split (`src/ui`, `src/capacitor`, `src/server`,
`src/utils`); `bun erp check:package-targets` rejects an unsplit multi-target package.
