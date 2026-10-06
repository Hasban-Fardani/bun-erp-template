# Organizations

Opt-in tenant layer on the Better Auth `organization` plugin. The default server is tenant-free;
this feature adds organizations, members, invitations and the active organization on the session,
without adding routes, RBAC permissions, navigation or i18n keys — Better Auth serves its own
endpoints under `/api/v1/auth/*`.

```
bun erp features:install organizations
```

What installs:

- `apps/server/features/organizations/plugin.ts` — `createOrganizationPlugin()`, the plugin factory
  the auth composition root registers (teams disabled, the plugin default).
- `apps/server/features/organizations/schema.ts` — Drizzle tables `organization`, `member` and
  `invitation` plus the Drizzle relations the plugin's joins address.
- `apps/server/database/migrations/NNNN_organizations.ts` — the plugin tables and the
  `session.active_organization_id` column, numbered into the app ledger on install.
- `apps/server/tests/features/organizations/organizations.test.ts` — a real Better Auth flow:
  sign up, create organizations, list them, set one active and read the session back.

Wiring edits (all deterministic, all fail the install when an anchor is missing):

- `auth-plugin` — `apps/server/features/identity/auth.ts` registers `createOrganizationPlugin()`.
- `auth-schema` — the same file adds `organization`, `member` and `invitation` to the drizzle
  adapter schema map the plugin is addressed by.
- `session-field` — `apps/server/features/identity/schema.ts` adds `activeOrganizationId` to the
  sessions table.
- `schema-export` — `apps/server/database/schema.ts` exports the tables and relations so the
  drizzle relational queries behind `listOrganizations` resolve.

The feature adds no catalog package (`requires` is empty) and no permission keys: RBAC stays
global and independent of organizations.

## Verify

```
bun erp check
bun test apps/server/tests/features/organizations
```

Removing the feature is manual: delete `apps/server/features/organizations` and its test, drop the
migration tables (or leave the ledger entry and drop them in a later migration), then revert the
wiring edits listed above and run `bun erp check`.
