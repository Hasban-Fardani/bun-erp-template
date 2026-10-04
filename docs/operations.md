# Operations

JSON logs go to stdout (`LOG_DRIVER=console`); daily file output is a bare-metal option.
Failed and slow requests carry request IDs. `APP_RELEASE` identifies the release.

`/api/v1/health` checks the process; `/api/v1/ready` queries the database.
Bun startup currently migrates and seeds infrastructure. CLI migration records `_migrations`;
rerunning is idempotent. Pending entries are visible through `bun erp db:status`.

Back up PostgreSQL before deployment/migration; test restoration on a separate database.
Production stores persistent state in PostgreSQL/object storage, not the application directory.
See [deployment](deployment.md) for release boundaries.
