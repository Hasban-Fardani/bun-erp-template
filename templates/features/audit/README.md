# audit

Web-only catalog feature: the audit-log viewer (filterable, sortable, CSV export, before/after
drawer) for the core `audit` module. The `audit.read` permission, `/api/v1/audit-logs` routes and
the append-only trail already ship in the default install; this feature adds the presentation and
its navigation entry.

```
bun loom features:install audit
```

What installs:

- `apps/web/src/features/audit/` — screen, API queries, hooks and types.
- `apps/web/src/pages/_authenticated/audit.tsx` and `apps/web/design/audit.json`.
- `apps/web/src/lib/use-table-state.ts` and `apps/web/src/lib/resource-table-labels.ts` (shared
  helpers, copied once and reused by every table feature).
- The `navigation.audit` sidebar entry and the `audit.*` locale keys.
- The `@loom/data-table` package, installed from the catalog and declared in `apps/web`.

Verify with `bun loom check`, then sign in as an owner and open `/audit`.
