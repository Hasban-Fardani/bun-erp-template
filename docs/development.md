# Development

From a clean clone:

    cp .env.example .env
    bun install --frozen-lockfile
    bun erp init
    bun erp db:migrate
    bun erp db:seed
    bun erp user:create <email> <password> --role owner --name <name>
    bun dev

Run `bun erp init` once after copying the template. It configures project-local CodeGraph and copies
the approved agent skills; see agent-init.md. Development commands do not sync or install agent
tooling. Never commit `.env` or credentials.

`bun dev` starts Vite with HMR and the Hono API. Open `http://localhost:5173`; Vite proxies `/api/*`
to the internal API listener on port 3000. The API process also runs the queue worker against the
same PostgreSQL connection, using the same polling loop as `bun erp jobs:work`. Stop the full stack with
Ctrl+C; an unexpected child-process exit stops its peers. Production Cloudflare serves the built
assets and API on one origin and drains queue work from its scheduled Worker handler.

The API and CLI use the same validated settings from `.env`; the dev launcher no longer fills in
missing values from `.env.example`. That file is a template to copy once, not a second runtime
configuration. `bun dev` changes only local runtime URLs, the auth secret when its local value is
empty, and release metadata. It refuses an `APP_ENV=production` configuration so development
startup cannot run migrations against a production-labeled database. Use `APP_ENV=development`
and point `DATABASE_URL` at a development PostgreSQL database before starting it. If a port
is already in use, the dev command reports which process failed; set `DEV_API_PORT` or
`DEV_WEB_PORT` to use different local ports. The matching URLs and proxy target are configured
together.

PostgreSQL is the only server database driver. The copied `.env.example` connects to local PostgreSQL;
start the Compose database with `docker compose up -d postgres` if you do not already have one.
Server SQLite is not configured; mobile's SQLite store is independent.

The seed at `apps/server/platform/database/seed.ts` creates the default organization and the
system roles. `bun dev` runs this seed at startup; it does not create a user. Create an account
through the CLI with the same `.env` database configuration used by the app:

    bun erp user:create <email> <password> --role owner --name <name>

The command prints the environment and driver used. CLI operations and the running app use the same
PostgreSQL connection concurrently, so user and role changes are immediately shared. New passwords
must be at least 10 characters. With the development app running,
`bun run qa:login` uses Playwright to verify failed login feedback appears as an accessible toast
outside the form.

The seeded role keys are `owner` and `staff`; `admin` and `user` are not role keys. If the
organization has no users, `user:create` defaults the first account to `owner`; later accounts
default to `staff`. Use `--role` when you want an explicit role. `bun erp db:seed` is idempotent
and can also run all feature seeders under `apps/server/seeders`; pass a seeder name to run only
that one. Use a strong, unique password and never store it in this document.

Manage roles and accounts with the rest of the CLI: `role:list`, `role:show <key>`, `role:create`,
`role:edit` (`--permissions a,b` replaces the whole set), and `role:delete`; `user:list`,
`user:show <email>`, `user:edit` (`--roles a,b` replaces organization-wide roles), `user:delete`,
`user:grant`, `user:revoke`, and `user:passwd`. Destructive commands refuse to run without `--force`.

`bun erp make:feature <name>` generates the feature module (validation, policy, schema, service,
route, test, README) plus a create-table migration, and registers the permission keys, audit
entity, and explicit route mount. `make:migration create_posts_table` and
`add_status_to_posts_table` fill the table and column names into the SQL template, and
`make:seeder users` normalizes a `-seeder` suffix to `users.ts`. After generating a feature, add
the domain fields and run `bun erp db:migrate` followed by `bun erp db:seed`.

`bun erp apps` lists workspace apps with build, port, and test status; `apps:status <name>` shows
one app's entry point, scripts, build output, and environment file; `apps:create <name>` adds a
minimal Bun workspace app under `apps/` and registers it in the root workspaces (run `bun install`
afterwards).

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
