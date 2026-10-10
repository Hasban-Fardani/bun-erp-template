# departments — reference feature

The smallest complete feature in the catalog: a server module, a web screen, and the HTTP test.
Install it into a deployment with:

```
bun loom features:list
bun loom features:install departments
```

## What lands where

| Catalog | Installed |
|---|---|
| `server/*` | `apps/server/features/departments/` |
| `web/*` | `apps/web/src/features/departments/` |
| `web/pages/departments.tsx` | `apps/web/src/pages/_authenticated/departments.tsx` |
| `web/design/departments.json` | `apps/web/design/departments.json` |
| `tests/*` | `apps/server/tests/features/departments/` |

`feature.json` drives the wiring: the `department.*` permission statements, the `department`
audit snapshot allowlist, the `FEATURES` route mount, the sidebar entry, and the `departments.*`
keys in both locale catalogs.

## Migration

The feature owns its table: `migrations/0002_departments.ts` is declared in `feature.json` and the
installer numbers it into `apps/server/database/migrations/` as the next contiguous migration.
The default install ships no departments table; it only exists after `features:install departments`.

## Notes

- The table is global to the server; the default server has no tenant concept, so no
  organization column is involved. Tenant scoping belongs to the opt-in organizations feature.
- Routes cover list/read/create/update plus data safety: `DELETE /:id` soft-deletes (the row keeps
  its history), `POST /:id/restore` brings it back, and `DELETE /:id/force` removes it for good.
  Default reads and lists exclude deleted rows; `?includeDeleted=true` opts in.
- `PATCH /:id` requires `expectedVersion` (the version last read). A stale version is a 409 whose
  `error.details.currentVersion` carries the live version.
