# Deployment

API runs as Bun source on bare metal or Docker. Docker/systemd artifacts are not supplied.
Deploy configuration externally; set APP_ENV=production and a release identifier. Run checks,
tests, migration, seed and readiness checks. API startup also migrates today.

Web is a separate Vite build (`apps/web/dist`), served by a static host. Set the absolute
HTTPS API origin in VITE_API_BASE_URL before building; copying dist also copies that URL.
No API static-file server is implemented. Cloudflare Worker API/Hyperdrive remains planned.

PostgreSQL 16–18: fresh PG16/17 databases receive the UUIDv7 polyfill in migration 0001;
PG18 keeps native UUIDv7. A database with 0001 already recorded will not replay it. Check the
function before moving an existing database to PG16/17; never erase the migration ledger.
Audit privileges and backup requirements are in [security](security.md) and [operations](operations.md).
Native packaging/release prerequisites are in [mobile](mobile.md).
