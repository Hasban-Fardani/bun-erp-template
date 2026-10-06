# Feature catalog

Installable features live here until a deployment needs them. The default install ships the core
modules only (`identity`, `rbac`, `audit`, `notifications`) and a web app of login, overview
(Beranda) and the notifications inbox; a catalog feature lands directly in `apps/*` and wires
itself in, the way `packages:install` lands a package in `packages/`.

```
bun erp features:list
bun erp features:install users
bun erp features:install departments
```

## Kinds

A manifest declares `kind`; an absent `kind` means `server`.

- **`server`** (default) — a full module: server files and test, web files, page, design spec, and
  the permission statements, audit snapshot allowlist and `FEATURES` route mount. `departments` is
  the reference server feature.
- **`web`** — presentation only: web files, page, design spec, navigation and i18n. The API,
  permissions and audit trail already exist in core (`identity`, `rbac`, `audit`), so no server
  wiring happens. `users`, `roles` and `audit` are the reference web features.
- **`infra`** — server infrastructure: copies app-side wiring files and applies the composition-root
  operations named in `wiring`; it may also install catalog packages from `requires` and ship a
  forward-only migration. No routes, permissions, audit, navigation or i18n. `mail` is the reference
  package-installing infra feature: it brings back the `@bun-erp/mail` transport and the
  notifications mail channel that the default server intentionally omits. `organizations` is the
  reference Better Auth infra feature: it registers the `organization` plugin, its tables and the
  session's active organization without adding a package.

## Layout

```
templates/features/<name>/
  feature.json          # manifest: wiring data + the files to copy
  README.md             # what the feature is and anything an operator must know
  server/               # server kind only: apps/server/features/<name>/ contents
  web/                  # apps/web/src/features/<name>/ contents
  web/pages/<name>.tsx  # apps/web/src/pages/_authenticated/<name>.tsx wrapper
  web/design/<name>.json# apps/web/design/<name>.json direction spec (required by the design gate)
  tests/                # server and infra kinds: apps/server/tests/features/<name>/ contents
  migrations/           # optional, server and infra kinds: numbered forward-only TypeScript migrations
templates/features/_shared/web/
  use-table-state.ts    # table URL state helper shared by the table screens
  resource-table-labels.ts
```

Shared helpers are declared in each manifest's `files.shared` as `_shared/web/<file>.ts`; the
installer copies them into `apps/web/src/lib/` and skips one that is already present, so several
installed features share a single copy. `use-table-state.ts` is self-contained;
`resource-table-labels.ts` needs the `data-table` package it declares in `requires`.

`feature.json` fields:

| Field | Purpose |
|---|---|
| `name` | Feature identity; must equal the directory name. |
| `kind` | `server` (default), `web` or `infra`; see above. |
| `wiring` | Infra kind: the composition-root operations to apply — mail uses `context`, `bootstrap`, `cloudflare`, `jobs`, `notifications`; organizations uses `auth-plugin`, `auth-schema`, `session-field`, `schema-export`. Every anchor must be present or the install fails. |
| `permissionResource` | Server kind: key added to `apps/server/features/rbac/statements.ts` as `<resource>: [create, read, update, delete]`. |
| `auditEntity` | Server kind: key added to `AUDIT_FIELDS` in `apps/server/features/audit/redact.ts`. |
| `auditFields` | Server kind: optional snapshot allowlist for that key; defaults to `id, createdAt, updatedAt`. |
| `requires` | Catalog packages (`templates/packages/<name>`); the installer installs them and adds `@bun-erp/<name>` to `apps/web` (or `apps/server` for infra) before writing files. An infra feature may leave it empty when it only wires core files. |
| `nav` | Sidebar entry: `titleKey`, `url`, lucide `icon`, `permission`. |
| `i18nKeys` | `en-US` and `id-ID` message keys the screen needs; keys already present are left alone. |
| `files.web` | Web feature files, relative to the catalog directory. |
| `files.shared` | Optional `_shared/web/*.ts` helpers copied to `apps/web/src/lib/` (skip-if-present). |
| `files.page` | The `web/pages/<name>.tsx` route wrapper. |
| `files.design` | Optional design-direction spec copied to `apps/web/design/<name>.json`. |
| `files.server`, `files.tests` | Server and infra kinds: server module/wiring and test files. |
| `migrations` | Server and infra kinds: optional migration files; the installer numbers them into `apps/server/database/migrations/`. |

The installer:

1. refuses to run when the feature is already installed (server module, page or web directory);
2. validates every declared file, refuses paths that escape the catalog, and refuses to overwrite an
   existing file (shared helpers are the only skip-if-present entries);
3. installs the packages named in `requires` and declares their workspace dependency in `apps/web`
   (or `apps/server` for an infra feature);
4. copies the manifest files into `apps/server/features/<name>/` (server and infra kinds),
   `apps/web/src/features/<name>/`, `apps/server/tests/features/<name>/` (server and infra kinds),
   the page wrapper, the design spec, and the shared helpers;
5. wires statements, audit fields, the `FEATURES` mount (server kind), the composition-root
   operations (infra kind), the nav entry, and both locale catalogs — adding only i18n keys the
   catalog does not already hold;
6. formats every written file and regenerates `apps/web/src/routeTree.gen.ts`;
7. never leaves a partial install: a missing anchor or a refused file fails before writing.

Removing a feature is a manual, deliberate act: delete the copied directories, page, design spec and
its wiring edits, regenerate the route tree, and delete a shared helper only when no installed
feature uses it. The installer has no uninstall command on purpose — wiring edits are visible in
the diff.

## Rules for a catalog feature

- Self-contained: a server feature may import the HTTP helpers, bootstrap context, database, and the
  core `audit`/`rbac` modules, but never another optional feature. A web feature may import the
  core `identity` auth hooks and the shared `lib/` helpers.
- Ship a test under `tests/`; the `tdd` gate fails an installed server feature without one.
- Migrations are forward-only TypeScript modules; a feature that creates a table ships its own
  migration in `migrations/` and the installer numbers it into the app ledger, so the table exists
  only once the feature is installed.
- Keep `README.md` factual: what installs, what it needs, and how to verify it.
