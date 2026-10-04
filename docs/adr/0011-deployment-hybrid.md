# ADR-0011 — Bun and Cloudflare deployment targets

**Status:** Accepted; shared Cloudflare Worker and static assets are implemented.

Bun remains the source-runtime target for local development and traditional hosting. Development
uses Vite HMR with an internal API process. A Bun production host runs the built web app and Hono API
on one listener, with `/api/*` reserved for the API and browser navigations falling back to the Vite
entry point. An API-only Bun command remains available for split deployments.

The Cloudflare Vite plugin bundles the same Hono API as a Worker and serves the web build through
Workers Static Assets in one deployment. Requests under `/api` and `/api/*` run through Hono; other
paths use the web asset fallback. Static asset requests bypass Worker code and quota. Hyperdrive
supplies the PostgreSQL connection. The Worker does not run migrations during a request.

Background work uses the PostgreSQL queue selected in ADR-0015. Bun runs a polling worker command;
Cloudflare uses a scheduled handler to drain a bounded batch. These are execution adapters for one
durable queue contract, not separate feature queues.

Cloudflare production deployment still requires project-owned account, Hyperdrive and secret setup.
See docs/deployment.md.
