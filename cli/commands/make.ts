import { resolve } from "node:path";
import { requireApps } from "../lib/apps.ts";
import { parseCommandOptions } from "../lib/options.ts";
import { resolveRequired } from "../lib/prompt.ts";
import { MIGRATIONS_DIR, repoRoot, SEEDERS_DIR } from "../lib/repo.ts";
import { formatScaffold, regenerateWebRouteTree, writeScaffold } from "../lib/scaffold.ts";
import {
  addAuditEntity,
  addI18nKeys,
  addNavItem,
  addRouteMount,
  addStatementResource,
  nextMigrationFile,
  parseMigrationName,
  renderFeatureScaffold,
  renderMigrationSource,
  renderSeederSource,
  renderWebFeatureScaffold,
  toSeederName,
  toSnakeName,
} from "../lib/scaffolding.ts";
import { defineCommand } from "../registry.ts";

export const commands = [
  defineCommand("make:feature", async (args) => {
    await requireApps(["server", "web"]);
    const rawName = resolveRequired(args[0], "Feature name");
    if (!rawName || rawName.startsWith("--")) {
      process.stderr.write("Usage: bun erp make:feature <name>\n");
      process.exit(1);
    }
    const scaffold = renderFeatureScaffold(rawName);
    const web = renderWebFeatureScaffold(scaffold);
    for (const file of [...scaffold.files, ...web.files]) {
      const path = resolve(repoRoot, file.path);
      if (await Bun.file(path).exists()) throw new Error(`Refusing to overwrite existing file: ${file.path}`);
    }

    const existing = [...new Bun.Glob("*.ts").scanSync({ cwd: MIGRATIONS_DIR })];
    const migrationFile = nextMigrationFile(existing, `create_${scaffold.table}_table`);
    for (const file of scaffold.files) await writeScaffold(resolve(repoRoot, file.path), file.contents);
    for (const file of web.files) await writeScaffold(resolve(repoRoot, file.path), file.contents);
    const migrationPath = `apps/server/database/migrations/${migrationFile}`;
    await writeScaffold(
      resolve(MIGRATIONS_DIR, migrationFile),
      renderMigrationSource({ mode: "create", table: scaffold.table }),
    );

    const statementsPath = "apps/server/features/rbac/statements.ts";
    const statements = addStatementResource(
      await Bun.file(resolve(repoRoot, statementsPath)).text(),
      scaffold.resource,
    );
    if (statements.status === "added") await Bun.write(resolve(repoRoot, statementsPath), statements.source);
    const auditPath = "apps/server/features/audit/redact.ts";
    const audit = addAuditEntity(await Bun.file(resolve(repoRoot, auditPath)).text(), scaffold.resource);
    if (audit.status === "added") await Bun.write(resolve(repoRoot, auditPath), audit.source);
    const routesPath = "apps/server/routes/api.ts";
    const routes = addRouteMount(await Bun.file(resolve(repoRoot, routesPath)).text(), scaffold);
    if (routes.status === "added") await Bun.write(resolve(repoRoot, routesPath), routes.source);

    const navPath = "apps/web/src/config/navigation.ts";
    const nav = addNavItem(await Bun.file(resolve(repoRoot, navPath)).text(), scaffold);
    if (nav.status === "added") await Bun.write(resolve(repoRoot, navPath), nav.source);
    const enPath = "packages/i18n/src/messages/en-US.ts";
    const en = addI18nKeys(await Bun.file(resolve(repoRoot, enPath)).text(), scaffold, "en-US");
    if (en.status === "added") await Bun.write(resolve(repoRoot, enPath), en.source);
    const idPath = "packages/i18n/src/messages/id-ID.ts";
    const id = addI18nKeys(await Bun.file(resolve(repoRoot, idPath)).text(), scaffold, "id-ID");
    if (id.status === "added") await Bun.write(resolve(repoRoot, idPath), id.source);

    // Wiring edits happen after the scaffold is written, so format every touched file together or lint fails.
    const touched = [
      [statementsPath, statements.status],
      [auditPath, audit.status],
      [routesPath, routes.status],
      [navPath, nav.status],
      [enPath, en.status],
      [idPath, id.status],
    ]
      .filter(([, status]) => status === "added")
      .map(([path]) => path as string);
    await formatScaffold([
      ...scaffold.files.map((file) => file.path),
      ...web.files.map((file) => file.path),
      migrationPath,
      ...touched,
    ]);

    // The typed route tree must list the new page or createFileRoute fails the types gate.
    await regenerateWebRouteTree();

    process.stdout.write(`Created feature: apps/server/features/${scaffold.name}\n`);
    for (const file of scaffold.files) process.stdout.write(`  ${file.path}\n`);
    process.stdout.write(`Created migration: apps/server/database/migrations/${migrationFile}\n`);
    process.stdout.write(`Created web feature: apps/web/src/features/${scaffold.name}\n`);
    for (const file of web.files) process.stdout.write(`  ${file.path}\n`);
    if (statements.status === "added") {
      process.stdout.write(`Registered permissions: ${scaffold.resource}.create, read, update, delete\n`);
    } else if (statements.status === "present") {
      process.stdout.write(`Permissions already registered: ${scaffold.resource}.*\n`);
    } else {
      process.stdout.write(
        `Register the ${scaffold.resource}.* permissions in apps/server/features/rbac/statements.ts\n`,
      );
    }
    if (audit.status === "added") {
      process.stdout.write(`Registered audit entity: ${scaffold.resource}\n`);
    } else if (audit.status === "skipped") {
      process.stdout.write(`Register the ${scaffold.resource} audit fields in apps/server/features/audit/redact.ts\n`);
    }
    if (routes.status === "added") {
      process.stdout.write(`Registered feature: /api/v1/${scaffold.name}\n`);
    } else if (routes.status === "present") {
      process.stdout.write(`Feature already registered: /api/v1/${scaffold.name}\n`);
    } else {
      process.stdout.write(`Add ${scaffold.camel}Feature to the FEATURES array in apps/server/routes/api.ts\n`);
    }
    if (nav.status === "added") {
      process.stdout.write(`Added navigation: /${scaffold.name}\n`);
    } else if (nav.status !== "present") {
      process.stdout.write(`Add a sidebar entry for /${scaffold.name} in apps/web/src/config/navigation.ts\n`);
    }
    if (en.status === "added" && id.status === "added") {
      process.stdout.write(`Added i18n keys: ${scaffold.name}.* and navigation.${scaffold.name}\n`);
    } else {
      process.stdout.write(`Add the ${scaffold.name}.* i18n keys to packages/i18n/src/messages\n`);
    }
    process.stdout.write("Regenerated apps/web/src/routeTree.gen.ts\n");
    process.stdout.write("Next: add the domain fields, then run bun erp db:migrate && bun erp db:seed.\n");
  }),
  defineCommand("make:migration", async (args) => {
    await requireApps(["server"]);
    const parsed = parseCommandOptions(args, { values: ["create", "table"] });
    const rawName = resolveRequired(parsed.positional[0], "Migration name");
    if (!rawName) {
      process.stderr.write("Usage: bun erp make:migration <name> [--create <table>] [--table <table>]\n");
      process.exit(1);
    }
    if (parsed.values.has("create") && parsed.values.has("table")) {
      throw new Error("Use either --create or --table, not both");
    }
    const intent = parsed.values.has("create")
      ? { mode: "create" as const, table: toSnakeName(parsed.values.get("create") ?? "") }
      : parsed.values.has("table")
        ? { mode: "alter" as const, table: toSnakeName(parsed.values.get("table") ?? "") }
        : parseMigrationName(rawName);
    const existing = [...new Bun.Glob("*.ts").scanSync({ cwd: MIGRATIONS_DIR })];
    const file = nextMigrationFile(existing, rawName);
    await writeScaffold(resolve(MIGRATIONS_DIR, file), renderMigrationSource(intent));
    process.stdout.write(`Created migration scaffold: apps/server/database/migrations/${file}\n`);
    process.stdout.write(
      intent.mode === "stub"
        ? "Implement its forward-only schema change before running bun erp db:migrate.\n"
        : "Fill in the domain columns and indexes, then run bun erp db:migrate.\n",
    );
  }),
  defineCommand("make:seeder", async (args) => {
    await requireApps(["server"]);
    const rawName = resolveRequired(args[0], "Seeder name");
    if (!rawName || rawName.startsWith("--")) {
      process.stderr.write("Usage: bun erp make:seeder <name>\n");
      process.exit(1);
    }
    const name = toSeederName(rawName);
    const target = resolve(SEEDERS_DIR, `${name}.ts`);
    await writeScaffold(target, renderSeederSource(name));
    process.stdout.write(`Created seeder scaffold: apps/server/database/seeders/${name}.ts\n`);
    process.stdout.write("`bun erp db:seed` runs all feature seeders; add deterministic, idempotent data first.\n");
  }),
];
