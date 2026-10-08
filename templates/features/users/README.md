# users

Web-only catalog feature: the user administration screen (list, create, edit, delete) for the core
`identity` module. Permissions (`user.*`), the `/api/v1/users` routes and the audit trail already
ship in the default install; this feature adds the presentation and its navigation entry.

```
bun erp features:install users
```

What installs:

- `apps/web/src/features/users/` — screen, user sheet, API queries, hooks and types.
- `apps/web/src/pages/_authenticated/users.tsx` and `apps/web/design/users.json`.
- `apps/web/src/lib/use-table-state.ts` and `apps/web/src/lib/resource-table-labels.ts` (shared
  helpers, copied once and reused by every table feature).
- The `navigation.users` sidebar entry and the `users.*`/`userForm.*` locale keys.
- The `@bun-erp/data-table` package, installed from the catalog and declared in `apps/web`.

Verify with `bun erp check`, then sign in as an owner and open `/users`.

## Impersonation

Owners (permission `user.impersonate`) get an **Impersonate** row action with a confirm dialog. While it is
active every page shows a non-dismissible "Viewing as <name> - Stop" banner. The session lasts at most
`IMPERSONATION_TTL_MINUTES`, cannot change the target's password, email, sessions or 2FA, and every action is
audited as "by <admin> as <user>". Policy and how to disable it in production: `docs/security.md`.
