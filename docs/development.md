# Development

From a clean clone:

    cp .env.example .env
    bun install --frozen-lockfile
    bun erp init                    # choose the app combination (default server+web)
    bun erp db:migrate
    bun erp db:seed
    bun erp user:create <email> <password> --role owner --name <name>
    bun dev

`apps/` is a disposable install of the app catalog (empty on a fresh checkout); `bun erp init` is the single door. It offers the seven
combinations (server, web, mobile, server+web, server+mobile, web+mobile, server+web+mobile) as a
numbered choice list, copies the chosen catalogs from `templates/apps/`, registers the workspaces,
runs the first `bun install`, and configures project-local CodeGraph and the approved agent skills
(see Agent setup below). Non-interactive runs use `bun erp init --apps server,web --yes`; `--no-agents`
skips the agent tooling (CI still runs it because `check:agents` verifies the index). Development
commands do not sync or install agent tooling. Never commit `.env` or credentials.

<!-- template-only -->
A fork that starts a product runs `bun erp project:adopt --name <name> --purpose "<one line>"` (or
answers yes when `bun erp init` offers it). That deletes `docs/template/`, strips the marked
template-only blocks, fills the identity block, deletes `template.scope.json` and the `F3.*`
template tasks, and turns the scope gate off. See [template lifecycle](template/README.md).
<!-- /template-only -->

## Agent setup

Run `bun erp init` from the repository root before code exploration or development. Beyond the app
catalogs and the first `bun install`, it pins and syncs the local CodeGraph index at the release in
`cli/gates/codegraph.ts`, wires the CodeGraph MCP server into every detected agent (opencode
included, normalized to opencode's real schema), aligns an older global `codegraph` to the pinned
release, and installs the required agent skills — Matthew Pocock, Petr Kindlmann QA, Impeccable,
i-have-adhd and diagram-design — when any are missing. Re-running it updates the index, repairs
missing skills, and re-fits a detached web/mobile shell once a server app exists. CI setup runs
`bun erp init --apps server,web --yes` on every job; `bun dev` does not. The index is local state
under `.codegraph/` and is ignored by Git.

Context7 (`upstash/context7-mcp`) gives agents current library documentation over MCP. `bun erp init`
and `bun erp ai:update` write an `mcp.context7` entry into the opencode config when one exists; a
`CONTEXT7_API_KEY` in the environment is passed through to the server. Other agents have no shared
config file, so add Context7 manually to their MCP settings:

```json
{ "type": "local", "command": ["bunx", "--bun", "@upstash/context7-mcp"], "enabled": true }
```

Add `"environment": { "CONTEXT7_API_KEY": "<key>" }` to that entry when you use an API key.

For a nontrivial feature or architecture change, invoke `grill-me` before implementation and close
the open design decisions with the user. Read the relevant project skill and canonical docs before
editing. Use CodeGraph to locate and trace code first; use exact-text search after narrowing scope.

`bun erp check:agents` verifies every skill listed in `cli/gates/agent-skills.ts`, that the pinned
CodeGraph CLI resolves and reports the pinned version, and that the index contains the entry files of
the installed apps (the server and web entries once those apps are installed; a missing app is not
required). QA browser work uses Playwright only; Cypress skills and Cypress test files
are outside the approved toolchain. `bun erp check` includes this gate. Initialize first when it
reports a missing skill, an unavailable or drifted CLI, or an index entry.

Tool versions are pinned in `cli/gates/codegraph.ts`, `cli/gates/impeccable.ts` and
`cli/tasks/init-agents.ts`. CodeGraph CLI reference:
[project quickstart](https://github.com/colbymchenry/codegraph/blob/main/site/src/content/docs/getting-started/quickstart.md).
The skills are installed from [Matthew Pocock's skills repository](https://github.com/mattpocock/skills),
[Petr Kindlmann's QA skills repository](https://github.com/petrkindlmann/qa-skills),
[Impeccable](https://github.com/pbakaus/impeccable),
[i-have-adhd](https://github.com/ayghri/i-have-adhd) and
[diagram-design](https://github.com/cathrynlavery/diagram-design). Two skill directories coexist and
are not interchangeable: `skills/` holds this repository's own skills (see `skills/README.md`), while
`.agents/skills/` holds the externally installed skills above. `skills-lock.json` records their
pinned sources; `.agents/skills/` itself is ignored by Git and restored by `bun erp ai:update`. The QA
project context at `.agents/qa-project-context.md` records this repository's test stack and rules.

`bun erp check:impeccable` runs the pinned Impeccable design detector over every UI surface that
exists on disk and requires 0 findings. It runs in `bun erp check` but not `bun erp check:fast`; the
engine is networked on its first run. `impeccable` is mandatory for UI and design work (see
`AGENTS.md`).

## Install size

The git repository is small (a few MB); the disk footprint comes from `node_modules`. A full
development install is around 0.9 GB because it carries the whole toolchain: Biome, TypeScript,
Playwright, the Vite/Rolldown bundler, the Cloudflare Workers runtime (`workerd`/`miniflare`), and
the Capacitor mobile tooling when the mobile catalog app is installed.

For a run-only environment (CI, containers, a VPS), install runtime dependencies only:

    bun install --production

That drops every `devDependencies` tree and lands around 0.4 GB. The `Dockerfile` already uses this
for its runtime stage, so `docker compose build` never ships the toolchain. Do not run `--production`
in a checkout where you still need `bun run lint`, `bun erp check`, or `bun erp test` — reinstall with
plain `bun install` to restore the dev tooling.

`bun dev` starts Vite with HMR and the Hono API. Open `http://localhost:5173`; Vite proxies `/api/*`
to the internal API listener on port 3000. The API process also runs the queue worker against the
same PostgreSQL connection, using the same polling loop as `bun erp jobs:work`. Vite starts only
after the API answers `GET /api/v1/ready` (30 s budget, override with `DEV_READY_TIMEOUT_MS`); a
boot crash exits 1 without starting the web app, and three consecutive failed readiness probes after
start stop both processes. Stop the full stack with Ctrl+C; an unexpected child-process exit stops
its peers. Production Cloudflare serves the built assets and API on one origin and drains queue work
from its scheduled Worker handler.

The API and CLI use the same validated settings from `.env`; the dev launcher no longer fills in
missing values from `.env.example`. That file is a template to copy once, not a second runtime
configuration. `bun dev` changes only local runtime URLs, the auth secret when its local value is
empty, and release metadata. It refuses an `APP_ENV=production` configuration so development
startup cannot run migrations against a production-labeled database. Use `APP_ENV=development`
and point `DATABASE_URL` at a development PostgreSQL database before starting it. If a port
is already in use, the dev command reports which process failed; set `DEV_API_PORT` or
`DEV_WEB_PORT` to use different local ports. The matching URLs and proxy target are configured
together.

## Troubleshooting

### API fails at boot with 42P10 / missing table

`bun dev` waits for `GET /api/v1/ready` before it starts Vite. If the API cannot boot — Postgres
answering `42P10` (`there is no unique or exclusion constraint matching the ON CONFLICT
specification`), `42P01` (missing table), or `42703` (missing column) — the launcher prints the
`boot.failed` event and exits 1 without starting the web app.

Those SQLSTATEs mean the live schema is older than `apps/server/database/migrations`, usually
because the database was created by an earlier catalog. Compare the ledger with the catalog:

    bun erp db:status

`mismatch` rows name the ledger entry next to the catalog file that now owns that number; a
different stem under the same number means the database cannot be migrated forward. On local or
test data, rebuild the schema from the catalog:

    bun erp db:reset --force

`db:reset` is refused when `APP_ENV=production`. It drops and recreates the `public` schema, applies
every migration, and runs the seed. Start `bun erp dev` again afterwards.

PostgreSQL is the only server database driver. The copied `.env.example` connects to local PostgreSQL;
start the Compose database with `docker compose up -d postgres` if you do not already have one.
Server SQLite is not configured; the mobile catalog app's SQLite store is independent.

The seed at `apps/server/database/seed.ts` creates the permission catalogue and the
system roles. `bun dev` runs this seed at startup; it does not create a user. Create an account
through the CLI with the same `.env` database configuration used by the app:

    bun erp user:create <email> <password> --role owner --name <name>

The command prints the environment and driver used. CLI operations and the running app use the same
PostgreSQL connection concurrently, so user and role changes are immediately shared. New passwords
must be at least 10 characters. With the development app running,
`bun erp qa --only=login` uses Playwright to verify failed login feedback appears as an accessible toast
outside the form.

The seeded role keys are `owner` and `staff`; `admin` and `user` are not role keys. If the
database has no users, `user:create` defaults the first account to `owner`; later accounts
default to `staff`. Use `--role` when you want an explicit role. `bun erp db:seed` is idempotent
and can also run all feature seeders under `apps/server/database/seeders`; pass a seeder name to run only
that one. Use a strong, unique password and never store it in this document.

Manage roles and accounts with the rest of the CLI: `role:list`, `role:show <key>`, `role:create`,
`role:edit` (`--permissions a,b` replaces the whole set), and `role:delete`; `user:list`,
`user:show <email>`, `user:edit` (`--roles a,b` replaces the user's roles), `user:delete`,
`user:grant`, `user:revoke`, and `user:passwd`. Destructive commands refuse to run without `--force`.

`bun erp make:feature <name>` generates the server feature module (validation, policy, schema,
service, route, test) plus a create-table migration, then registers the permission keys,
audit entity, and explicit route mount. It also generates the web feature (types, api/queries,
hooks, screen, route page), wires the sidebar entry and both locale catalogs, and regenerates
`apps/web/src/routeTree.gen.ts` with a web build. Optimistic locking is emitted by default;
`--no-version` leaves it out. Soft delete is opt-in: pass `--soft-delete` only for master data that
history references, never for append-only or high-volume tables (logs, events, jobs, notifications,
sessions, join tables). `--sequence <key>` with `--prefix`/`--padding` adds the numbering column.
`make:migration create_posts_table` and `add_status_to_posts_table` fill the table and column names
into the SQL template, and `make:seeder users` normalizes a `-seeder` suffix to `users.ts`. After
generating a feature, add the domain fields and run `bun erp db:migrate` followed by `bun erp db:seed`.

### Generators

`bun erp --help` lists every generator under "Generators". Each one plans all of its paths and
wiring anchors before it writes, refuses to overwrite an existing file, and formats what it wrote,
so a failed run leaves the tree untouched and a second run is a no-op error.

| Command | Writes | Wires |
|---|---|---|
| `make:feature <name>` | server module, web screen, create-table migration, test, factory | permissions, audit entity, route mount, sidebar, both locale catalogs |
| `make:migration <name>` | numbered forward-only migration | none |
| `make:seeder <name>` | `database/seeders/<name>.ts` (use a factory for rows) | picked up by `db:seed` |
| `make:factory <feature> [--table <export>]` | `database/factories/<feature>.ts` | none; fills every notNull column without a default |
| `make:job <name>` | `apps/server/jobs/<name>.ts` and an idempotency test | `registry.register(...)` in `features/jobs.ts` (`// @erp:jobs`) |
| `make:event <feature> <name>` | `features/<feature>/events/<name>.ts` (`defineEvent` and its payload type) | none |
| `make:listener <feature> <name> --event <event>` | `features/<feature>/listeners/<name>.ts` and a dispatch test (rollback, idempotency key) | `features/events.ts` (`// @erp:listeners`) |
| `make:command <group:name>` | `cli/commands/<group>-<name>.ts` and a test | none: the registry reads the `defineCommand` literal |
| `make:test <feature> [name]` | `tests/features/<feature>/<name>.test.ts` (typed `testClient` when the feature has routes) | none |
| `make:notification <name> [--type domain.event]` | `features/notifications/<name>.notification.ts` and a test | export in `notifications/index.ts` (`// @erp:notifications`) |
| `make:mail <name>` | `apps/server/mail/<name>.ts` (pure renderer + queue helper) and a test | none; needs `bun erp features:install mail` |

A generator that needs a core file edit looks for an explicit `// @erp:` marker and stops before
writing when it is gone; restore the marker or wire by hand. After any generator, run
`bun erp check:fast` and `bun erp test --filter <feature>`. Generated tests carry `test.todo`
placeholders: write the failing test for the real behaviour first, then implement.

### Console

`bun erp tinker` opens a REPL with `db`, `schema` (every table), `env`, `sql`, `orm` (all of
`drizzle-orm`), `ctx` and a `vars` object that persists between lines. One input is one expression
(top-level `await` works) or a function body with `return`. `--eval "<expr>"` runs one input and
exits, for scripts: `bun erp tinker --eval "await db.select().from(schema.roles)"`. It refuses
`NODE_ENV=production` or `APP_ENV=production` unless you pass `--force`; it runs your code against
the configured database, so use it on production only for reads you could run in `psql`.

`bun erp apps` lists workspace apps with build, port, and test status; `apps:status <name>` shows
one app's entry point, scripts, build output, and environment file; `apps:create <name> <server|web|mobile>`
adds a workspace app under `apps/` (server scaffolds inline; web and mobile copy their catalog under
`templates/apps/`) and registers it in the root workspaces (run `bun install` afterwards). Adding a
web or mobile app without a server app installs it in detached mode: the RPC client is a stub and
`@bun-erp/server` is not a dependency. A later `bun erp init` that includes the server re-fits the
typed client.

`bun erp doctor` verifies configuration, database connectivity and the seed. Use `bun erp --help`
for the current command list. See mobile.md for native packaging and testing.md for test prerequisites.

For a local PostgreSQL-backed container stack, copy `.env.docker.example` to `.env.docker`, replace
the local-only passwords, then run `docker compose --env-file .env.docker up --build`. The app is
available at `http://localhost:3000`; its database and local development files use named volumes.
This Compose environment is for local development, not a public production deployment.

The dev command deliberately starts the Bun/Vite HMR stack regardless of the production target in
`.env`. Set `APP_DEPLOY_TARGET=bun|cloudflare` and `APP_WEB_MODE=integrated|separate` for production;
`bun erp build` uses that validated build profile. Cloudflare currently requires integrated static
assets. The template supports Bun and Cloudflare; Hono's runtime list is broader than the adapters
and platform APIs implemented here. See architecture.md before adding another target.
