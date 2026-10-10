# Security

Private routes authorize before parsing input. RBAC grants are server-enforced, including
distinctions between 401, 403 and 404. The default server is tenant-free: no table carries an
organization id. `bun loom features:install organizations` installs the Better Auth `organization`
plugin as the opt-in tenant layer — organization/member/invitation tables, invitations, and
`activeOrganizationId` on the session — together with its forward-only migration. The plugin serves
its own endpoints under `/api/v1/auth/*`; RBAC stays global and independent of organizations, and
tenant scoping of feature data remains an application decision, not an installer side effect.

Secrets live in ignored environment files or deployment secrets. `env:list` displays secret
presence only. Pino log redaction is in `infra/observability/logger.ts`; audit snapshots use
entity allowlists plus secret filtering. Neither control replaces the other.

Email/password auth uses Better Auth. Google sign-in turns on when both Google credentials are set,
and `AUTH_PASSWORD_ENABLED=false` makes it Google-only (no password hashing at all); only provisioned
accounts can sign in unless self sign-up is on (ADR-0009).
Production env guards run during bootstrap. Passwords are hashed with `PASSWORD_HASH`: `pbkdf2`
(default, PBKDF2-HMAC-SHA256, `PASSWORD_HASH_ITERATIONS=30000`, fits Cloudflare Workers Free) or `scrypt`
(memory-hard; prefer it on a VPS/Bun host). Stored hashes are self-describing, so switching never
invalidates existing passwords; accounts move to the new algorithm on their next password change
(Better Auth has no rehash-on-login hook). Comparison is constant-time and a stored iteration count
outside 1000-100000 is rejected. Details: docs/deployment.md. Password reset is described below.
The OpenAPI document and Scalar reference (`/api/docs`) expose the full route surface, so they
are off in production unless `API_DOCS_ENABLED=true` opts in deliberately.

## User impersonation

Owners can view the app as another user to reproduce an error (decision D6: full access, fully audited).

- **Who.** Only holders of `user.impersonate` (granted to the `owner` role by default) may call
  `POST /api/v1/users/:id/impersonate`. Without it: 403.
- **Refused (403).** Impersonating yourself, a user who holds the `owner` role or `user.impersonate`, or
  starting a second impersonation while one is active. An unknown user is 404; no session is 401.
- **Session.** The start creates a normal `session` row for the target with `impersonated_by` set and
  `expires_at` at `IMPERSONATION_TTL_MINUTES` (default 60). Its token travels in a separate
  `loom_impersonation` cookie, so the admin's own session is never replaced. `POST /api/v1/impersonation/stop`
  deletes the row and clears the cookie; the admin is back at once. The cookie only works together with the
  admin's own live session. After the TTL the next request answers 401 and clears the cookie, and the
  admin's original session is still valid. State is DB-only, so it behaves the same on a VPS and on Workers.
- **Limits.** While the impersonation cookie is present, `/api/v1/auth/` change-password, set-password,
  change-email, update-user, delete-user, revoke-session(s) and `two-factor/*` return 403, so the target's
  credentials, sessions and 2FA cannot be changed.
- **Audit.** `impersonation.started` and `impersonation.stopped` are audit events attributed to the admin.
  Every other audit row written during an impersonation records the target as `actor_id` and the admin as
  `impersonator_id`; the audit screen renders it as "by X as Y".
- **Disable in production.** Set `IMPERSONATION_ENABLED=false`: the start endpoint answers 403 and no
  session can be created. Sessions already issued still expire at their TTL; revoke them by deleting
  `session` rows with `impersonated_by is not null`.

Better Auth's admin plugin was not used: it needs its own `role` column and role model, which would replace
this repository's RBAC.

## Password reset

Reset exists only when the opt-in mail feature is installed (`bun loom features:install mail`). Without it,
`sendResetPassword` stays unset, Better Auth answers `400 RESET_PASSWORD_DISABLED`, and the web
forgot-password screen tells the person to ask an administrator (`bun loom user:create` / the users screen).

With mail installed the flow is:

1. `POST /api/v1/auth/request-password-reset` with `{ email, redirectTo }`. The server never sends inline:
   the sender enqueues a durable `mail.send` job in the database (`features/mail/password-reset.ts`), and the
   worker delivers it through the configured mail driver, retrying transient failures.
2. The job's idempotency key is `password-reset:<sha256(token)[0..32]>`: a retried request cannot enqueue the same
   link twice, and the token itself is never stored in the key or in logs.
3. The link opens `/reset-password?token=...`. `POST /api/v1/auth/reset-password` with `{ token, newPassword }`
   sets the password (minimum 10 characters) and revokes every existing session
   (`revokeSessionsOnPasswordReset`).

Token TTL is one hour (`RESET_PASSWORD_TTL_SECONDS` in `features/identity/auth.ts`). A token is single use; an
expired, used or unknown token redirects with `error=INVALID_TOKEN` and the web screen shows the expired state.

Enumeration safety: Better Auth answers an unknown address with the same `200` body as a known one and the web
screen shows the same "if an account exists" message for both. The unknown-address path enqueues nothing and
does no mail work, so timing differs only by one database lookup versus one insert; request rate limiting
(`AUTH_RATE_LIMIT_ENABLED`) bounds probing. Set `APP_URL` and `AUTH_TRUSTED_ORIGINS` correctly: `redirectTo`
must be a trusted origin or Better Auth refuses it.

Authorization data is read from PostgreSQL; the optional permission cache
(`PERMISSION_CACHE_ENABLED`, default true) sits on the cache facade (`CACHE_DRIVER`, ADR-0016) with a
10-second TTL and is invalidated explicitly after a role write commits. With the default `memory`
driver it is an optimisation only: on Cloudflare Workers every isolate has its own copy, and on
multi-replica Bun an invalidation reaches the process that handled the write immediately and the
others at the TTL. `CACHE_DRIVER=database` shares entries and invalidations across replicas and
isolates. `cloudflare-kv` is eventually consistent, so the permission cache runs uncached under it.
Set `PERMISSION_CACHE_ENABLED=false` when a stale grant matters more than the saved RBAC join; see
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

## Supply chain and code scanning

`.github/dependabot.yml` opens weekly updates for GitHub Actions and Bun dependencies (keep pins
exact; review each PR). `.github/workflows/security.yml` runs `bun audit` (critical advisories fail,
high ones are printed) and CodeQL for `javascript-typescript` on pushes, pull requests and weekly.
Database backups are sensitive data: store them in a private bucket and restrict who can read the
`BACKUP_DATABASE_URL` secret (docs/operations.md).
