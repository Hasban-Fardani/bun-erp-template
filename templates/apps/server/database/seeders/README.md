# Feature seeders

`bun erp make:seeder <name>` writes `apps/server/database/seeders/<name>.ts`. Each seeder is a module
exporting `seed(database)`, and must be deterministic and idempotent because `bun erp db:seed`
may run it more than once.

`bun erp db:seed` seeds the infrastructure (organization, permissions, system roles) and then
runs every `*.ts` file in this directory. Pass a name to run one: `bun erp db:seed <name>`.

This directory may stay empty of `.ts` files. `db:seed` tolerates a missing or README-only
directory: it seeds the infrastructure and runs no feature seeders.
