# Feature seeders

`bun loom make:seeder <name>` writes `apps/server/database/seeders/<name>.ts`. Each seeder is a module
exporting `seed(database)`, and must be deterministic and idempotent because `bun loom db:seed`
may run it more than once.

`bun loom db:seed` seeds the infrastructure (permissions, system roles) and then
runs every `*.ts` file in this directory. Pass a name to run one: `bun loom db:seed <name>`.

This directory may stay empty of `.ts` files. `db:seed` tolerates a missing or README-only
directory: it seeds the infrastructure and runs no feature seeders.
