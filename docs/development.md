# Development

```bash
bun install --frozen-lockfile
cp .env.example .env
bun erp key:generate
bun erp db:migrate
bun erp db:seed
bun erp dev
```

PGlite is the default local database. Start web separately with `bun run --cwd apps/web dev`.
The proxy forwards `/api` to port 3000; `API_PORT` changes the proxy target.
`VITE_API_BASE_URL` is empty locally; a remote deployment sets an API origin without `/api/v1`.

Create the first owner after seeding:

```bash
bun erp user:create <email> <password> owner <name>
```

Replace placeholders locally; credentials must not enter Git or shared evidence.
`bun erp doctor` verifies environment, connection and seed; `bun erp --help` lists commands.
See [mobile](mobile.md) for native packaging and [testing](testing.md) for verification.
