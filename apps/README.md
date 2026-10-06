# Apps

This directory ships empty. The template installs the apps you choose at `bun erp init`:

```
bun erp init                       # interactive choice list
bun erp init --apps server,web --yes
```

`init` copies the chosen catalogs from `templates/apps/<kind>/` into `apps/<name>/`, registers them
in the root `workspaces`, and runs `bun install`. Add another app later with
`bun erp apps:create <name> <server|web|mobile>`; `server` scaffolds a minimal Bun service, while
`web` and `mobile` copy their catalog.

Catalog apps keep their own `package.json`, exact-pinned dependencies, and never import another
app's source. Shared presentation lives in `packages/ui`.
