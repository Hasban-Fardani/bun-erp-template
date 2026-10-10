# App catalog

`apps/` holds the installed apps; app combinations are chosen at `bun loom init`, which copies them
from this catalog (an unconfigured template checkout has `apps/` empty). The catalog holds the three
installable apps:

- `server/` — the full Hono + Drizzle API (`@loom/server`), including `tests/` and the
  server-owned CLI commands under `cli/`.
- `web/` — the minimal Vite + React shell (`@loom/web`): login, overview (Beranda),
  notifications, and the authenticated layout.
- `mobile/` — the React + Capacitor shell (`@loom/mobile`), separate from web source.

## Install

```
bun loom init                       # numbered choice list of all seven combinations
bun loom init --apps server,web --yes
bun loom apps:create reports server
bun loom apps:create shop web
bun loom apps:create field mobile
```

`init` installs the chosen combination and the agent tooling (unless `--no-agents`).
`apps:create <name> <kind>` copies `web`/`mobile` and renames the package to `@loom/<name>`;
`server` scaffolds a minimal Bun service inline. The copy excludes `node_modules`, `dist`, `www`,
`.wrangler`, and `.tanstack`; run `bun install` afterwards. Full flow and CI usage:
docs/development.md.

Catalogs keep their real package names (`@loom/server`, `@loom/web`, `@loom/mobile`) so
`init` installs them at their reference paths; only `apps:create` renames the package.

## Server contract

Web and mobile compile against the server's typed Hono contract when a server app exists. Without a
server they install detached: `src/lib/rpc.ts` becomes a stub and `@loom/server` is not a
dependency. Running `bun loom init` again with a combination that includes the server re-fits the
real client and removes the detached marker. `bun loom mobile:*` and the mobile gate expect the
created app at `apps/mobile`, so name it `mobile` for the native workflow.

Keep catalog apps self-contained: their own `package.json`, exact-pinned dependencies, and no
imports from another app's source.
