# departments — reference feature

The smallest complete feature in the catalog: a server module, a web screen, and the HTTP test.
Install it into a deployment with:

```
bun erp features:list
bun erp features:install departments
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

The `departments` table already exists in the base migration history
(`apps/server/database/migrations/0002_departments.ts`), so this feature ships no migration of its
own. A feature that needs a new table declares `"migrations": ["migrations/<file>.ts"]` in its
manifest; the installer numbers it into `apps/server/database/migrations/` as the next contiguous
migration.

## Notes

- The table is organization-scoped; routes take the organization from the session actor, never
  from client input.
- Routes cover list/read/create/update. There is no delete route; `department.delete` stays in
  the statements for deployments that add one.
