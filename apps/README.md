# Apps

This directory holds the installed apps (`apps/server`, `apps/web`, `apps/mobile`). They are copied
from the catalog by `bun loom init`, which is also how an empty checkout is populated:

```
bun loom init                       # interactive choice list
bun loom init --apps server,web --yes
```

`init` copies the chosen catalogs from `templates/apps/<kind>/` into `apps/<name>/`, registers them
in the root `workspaces`, and runs `bun install`. Add another app later with
`bun loom apps:create <name> <server|web|mobile>`; `server` scaffolds a minimal Bun service, while
`web` and `mobile` copy their catalog.

Catalog apps keep their own `package.json`, exact-pinned dependencies, and never import another
app's source. Shared presentation lives in `packages/ui`.
