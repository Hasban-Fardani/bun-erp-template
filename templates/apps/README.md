# App catalog

`apps/` holds the installed apps; app combinations are chosen at `bun erp init`, which copies them
from this catalog (an unconfigured template checkout has `apps/` empty). The catalog holds the three
installable apps:

- `server/` — the full Hono + Drizzle API (`@bun-erp/server`), including `tests/` and the
  server-owned CLI commands under `cli/`.
- `web/` — the minimal Vite + React shell (`@bun-erp/web`): login, overview (Beranda),
  notifications, and the authenticated layout.
- `mobile/` — the React + Capacitor shell (`@bun-erp/mobile`), separate from web source.

## Install

```
bun erp init                       # numbered choice list of all seven combinations
bun erp init --apps server,web --yes
bun erp apps:create reports server
bun erp apps:create shop web
bun erp apps:create field mobile
```

`init` installs the chosen combination and the agent tooling (unless `--no-agents`).
`apps:create <name> <kind>` copies `web`/`mobile` and renames the package to `@bun-erp/<name>`;
`server` scaffolds a minimal Bun service inline. The copy excludes `node_modules`, `dist`, `www`,
`.wrangler`, and `.tanstack`; run `bun install` afterwards. Full flow and CI usage:
docs/development.md.

Catalogs keep their real package names (`@bun-erp/server`, `@bun-erp/web`, `@bun-erp/mobile`) so
`init` installs them at their reference paths; only `apps:create` renames the package.

## Server contract

Web and mobile compile against the server's typed Hono contract when a server app exists. Without a
server they install detached: `src/lib/rpc.ts` becomes a stub and `@bun-erp/server` is not a
dependency. Running `bun erp init` again with a combination that includes the server re-fits the
real client and removes the detached marker. `bun erp mobile:*` and the mobile gate expect the
created app at `apps/mobile`, so name it `mobile` for the native workflow.

Keep catalog apps self-contained: their own `package.json`, exact-pinned dependencies, and no
imports from another app's source.
