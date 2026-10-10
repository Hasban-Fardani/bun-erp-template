# roles

Web-only catalog feature: role management (list, create, edit, delete, permission assignment) for
the core `rbac` module. The `role.*` permissions and `/api/v1/roles` routes already ship in the
default install; this feature adds the presentation and its navigation entry.

```
bun loom features:install roles
```

What installs:

- `apps/web/src/features/roles/` — screen, role sheets, API queries, hooks and types.
- `apps/web/src/pages/_authenticated/roles.tsx` and `apps/web/design/roles.json`.
- `apps/web/src/lib/use-table-state.ts` and `apps/web/src/lib/resource-table-labels.ts` (shared
  helpers, copied once and reused by every table feature).
- The `navigation.roles` sidebar entry and the `roles.*` locale keys.
- The `@loom/data-table` package, installed from the catalog and declared in `apps/web`.

The users screen (`features:install users`) also reads the role catalog for its role picker; roles
works on its own but the picker is most useful with both installed.

Verify with `bun loom check`, then sign in as an owner and open `/roles`.
