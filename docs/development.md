# Development

From a clean clone:

    bun install --frozen-lockfile
    bun erp init
    bun dev

Run `bun erp init` once after copying the template. It configures project-local CodeGraph and copies
the approved agent skills; see agent-init.md. Development commands do not sync or install agent
tooling. Never commit `.env` or credentials.

`bun dev` starts the app behind one local entry point: `http://localhost:5173`. Vite proxies `/api/*`
to the Hono server listening internally on port 3000, so frontend requests and API routes use the
same origin. Open only the Vite URL. The internal API port does not serve the UI at `/`; direct
requests to its `/` path return the API's not-found response. Production Cloudflare uses the same
origin model for built static assets and API routes.

The local API uses an isolated PGlite database at `.data/development`, applies migrations, and seeds
the reference organization at startup. It deliberately ignores repository `.env` values so local
development cannot connect to a deployment database or reuse production credentials. Configure
production-like service integrations with a separate, explicitly reviewed workflow. If a port is
already in use, the dev command reports which process failed; set `DEV_API_PORT` or `DEV_WEB_PORT` to
use different local ports. The matching URLs and proxy target are configured together.

PGlite is the default local/test Postgres-compatible server driver. `DATABASE_PATH` names the local
database directory; production uses PostgreSQL through `DATABASE_URL`. Server SQLite is not a
configured driver; mobile's SQLite store is independent.

Create the first owner after seeding:

    bun erp user:create <email> <password> owner <name>

bun erp doctor verifies configuration, database connectivity and the seed. Use bun erp --help for
the current command list. See mobile.md for native packaging and testing.md for test prerequisites.
