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
The OpenAPI document and Scalar reference (`/api/docs`) expose the full route surface, so they
are off in production unless `API_DOCS_ENABLED=true` opts in deliberately.

Authorization data is read from PostgreSQL; the optional permission cache
(`PERMISSION_CACHE_ENABLED`, default true) is a per-process `Map` with a 10-second TTL, invalidated
explicitly when a role write goes through. It is an optimisation only: on Cloudflare Workers every
isolate has its own copy, and on multi-replica Bun an invalidation reaches the process that handled
the write immediately and the others at the TTL. Set `PERMISSION_CACHE_ENABLED=false` for Workers
and multi-replica Bun when a stale grant matters more than the saved RBAC join; see
[deployment](deployment.md).

Better Auth rate limiting uses its database store (`rate_limit`, migration 0011), so a limit
consumed by one Worker isolate or Bun replica is visible to every other one; the sign-in endpoint
keeps Better Auth's stricter built-in rules. Treat the limit as abuse friction, not as a
distributed quota: the counter is per bucket key and the store prunes expired rows opportunistically.

Audit UPDATE/DELETE is rejected by migration 0006. The production DB role must not be a
superuser or hold TRUNCATE/DDL privileges. Keep backups and restrict database administration.

Web currently uses session cookies with credentials included and CORS origin allowlists.
Native Capacitor login/token transport is not implemented or verified; see [mobile](mobile.md).
Do not widen CORS or store tokens in localStorage merely to make a native login appear to work.
