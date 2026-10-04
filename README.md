# Bun ERP Template

Foundation for internal applications: Hono API, Drizzle/PostgreSQL, Better Auth, RBAC,
transactional audit, generated OpenAPI, React admin UI and Capacitor mobile packaging.
Business features belong in applications copied from this template.

## Run locally

```bash
bun install --frozen-lockfile
cp .env.example .env
bun erp key:generate
bun erp db:migrate
bun erp db:seed
bun erp dev
```

In another terminal: `bun run --cwd apps/web dev`. The web proxy targets the API on port 3000.
Create an owner following [development](docs/development.md). Never commit `.env`.

## Verify

```bash
bun erp check
bun erp test
bun erp build
```

Checks run concurrently; tests run sequentially because backend fixtures share state.
Browser QA additionally needs a running API, built web preview and test credentials.
CI is configured; actual CI results belong to each run, not this README.

## Mobile

`apps/mobile` packages the same React UI for Capacitor Android/iOS; no duplicated screens.
See [mobile setup](docs/mobile.md) for API URL, application identity and native toolchains.
Mobile assets can be built separately; native authentication and device/release validation remain unimplemented.

[Documentation index](docs/README.md) · [Agent guide](AGENTS.md)
