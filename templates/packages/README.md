# Package catalog

Opt-in packages live here until they are published, so the default repo stays lean and
`node_modules` stays small. The default install ships the core packages only: `ui`, `i18n`,
`utils`, `storage`.

## Install one

```
bun loom packages:list
bun loom packages:install data-table
bun loom packages:install charts --from https://github.com/<owner>/<repo>
```

`packages:install` copies the package into `packages/<name>`, registers it in the root
`workspaces`, and runs `bun install`. Add `"@loom/<name>": "workspace:*"` to the app that needs
it, then import from `@loom/<name>`.

A server package that must also wire the app has a catalog feature. `mail` is the reference:
`bun loom features:install mail` installs `packages/mail` and edits the composition root, while
`packages:install mail` only copies the package.

## Source

- Default: a directory here, `templates/packages/<name>/`.
- `--from <git-url>`: shallow-clones the repository and copies the package.
- Planned: `--from npm` once the packages are published under `@loom/*`.

A package added here must be self-contained: its own `package.json`, exact-pinned dependencies,
and no imports from an app.
