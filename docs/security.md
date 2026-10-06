# Security

Private routes authorize before parsing input. RBAC grants are server-enforced, including
distinctions between 401, 403 and 404. The default server is tenant-free: no table carries an
organization id. `bun erp features:install organizations` installs the Better Auth `organization`
plugin as the opt-in tenant layer — organization/member/invitation tables, invitations, and
`activeOrganizationId` on the session — together with its forward-only migration. The plugin serves
its own endpoints under `/api/v1/auth/*`; RBAC stays global and independent of organizations, and
tenant scoping of feature data remains an application decision, not an installer side effect.

Secrets live in ignored environment files or deployment secrets. `env:list` displays secret
presence only. Pino log redaction is in `infra/observability/logger.ts`; audit snapshots use
entity allowlists plus secret filtering. Neither control replaces the other.

Email/password auth uses Better Auth. Google is dormant unless both credentials are set.
Password reset email is not implemented. Production env guards run during bootstrap.

Audit UPDATE/DELETE is rejected by migration 0006. The production DB role must not be a
superuser or hold TRUNCATE/DDL privileges. Keep backups and restrict database administration.

Web currently uses session cookies with credentials included and CORS origin allowlists.
Native Capacitor login/token transport is not implemented or verified; see [mobile](mobile.md).
Do not widen CORS or store tokens in localStorage merely to make a native login appear to work.
