import { resolve } from "node:path";
import { requireApps } from "../lib/apps.ts";
import { ensureFeatureWebDependencies, planMakeFeature, writeMakeFeature } from "../lib/make-feature.ts";
import { parseCommandOptions } from "../lib/options.ts";
import { resolveRequired } from "../lib/prompt.ts";
import { MIGRATIONS_DIR, repoRoot, SEEDERS_DIR } from "../lib/repo.ts";
import { formatScaffold, regenerateWebRouteTree, writeScaffold } from "../lib/scaffold.ts";
import {
  nextMigrationFile,
  parseMigrationName,
  renderMigrationSource,
  renderSeederSource,
  toSeederName,
  toSnakeName,
} from "../lib/scaffolding.ts";
import { defineCommand } from "../registry.ts";

const WIRING_PATHS = {
  statements: "apps/server/features/rbac/statements.ts",
  audit: "apps/server/features/audit/redact.ts",
  routes: "apps/server/routes/api.ts",
  nav: "apps/web/src/config/navigation.ts",
  enUS: "packages/i18n/src/utils/messages/en-US.ts",
  idID: "packages/i18n/src/utils/messages/id-ID.ts",
} as const;

export const commands = [
  defineCommand("make:feature", async (args) => {
    await requireApps(["server", "web"]);
    const parsed = parseCommandOptions(args, {
      flags: ["soft-delete", "no-version"],
      values: ["sequence", "prefix", "padding"],
    });
    const rawName = resolveRequired(parsed.positional[0], "Feature name");
    if (!rawName) {
      process.stderr.write(
        "Usage: bun erp make:feature <name> [--sequence <key>] [--prefix <prefix>] [--padding <digits>] [--soft-delete] [--no-version]\n",
      );
      process.exit(1);
    }
    const paddingRaw = parsed.values.get("padding");
    const padding = paddingRaw === undefined ? undefined : Number(paddingRaw);
    if (padding !== undefined && (!Number.isInteger(padding) || padding < 0)) {
      throw new Error("--padding must be a non-negative integer");
    }
    const sequenceKey = parsed.values.get("sequence");
    const softDelete = parsed.flags.has("soft-delete");
    const version = !parsed.flags.has("no-version");

    // Plan validates every target path and wiring anchor before the first write: a missing anchor
    // aborts here instead of leaving a half-wired feature behind.
    const plan = await planMakeFeature(repoRoot, rawName, {
      ...(sequenceKey ? { sequence: { key: sequenceKey, prefix: parsed.values.get("prefix"), padding } } : {}),
      softDelete,
      version,
    });
    // The generated screen lists rows through the opt-in data-table package and the shared table
    // helpers; install them before the first feature write so a failed install writes nothing.
    const webDependencies = await ensureFeatureWebDependencies(repoRoot);
    if (webDependencies.changed) await Bun.$`bun install`.quiet();
    const touched = await writeMakeFeature(repoRoot, plan);

    // Wiring edits happen after the scaffold is written, so format every touched file together or lint fails.
    await formatScaffold([...touched, ...webDependencies.written]);

    // The typed route tree must list the new page or createFileRoute fails the types gate.
    await regenerateWebRouteTree();

    const statusOf = (path: string) => plan.wiring.find((edit) => edit.path === path)?.status;
    process.stdout.write(`Created feature: apps/server/features/${plan.scaffold.name}\n`);
    for (const file of plan.scaffold.files) process.stdout.write(`  ${file.path}\n`);
    process.stdout.write(`Created migration: ${plan.migration.path}\n`);
    process.stdout.write(`Created web feature: apps/web/src/features/${plan.scaffold.name}\n`);
    for (const file of plan.web.files) process.stdout.write(`  ${file.path}\n`);
    if (webDependencies.changed || webDependencies.written.length > 0) {
      process.stdout.write("Installed the data-table package and shared table helpers for the screen.\n");
    }
    if (statusOf(WIRING_PATHS.statements) === "added") {
      process.stdout.write(`Registered permissions: ${plan.scaffold.resource}.create, read, update, delete\n`);
    } else {
      process.stdout.write(`Permissions already registered: ${plan.scaffold.resource}.*\n`);
    }
    if (statusOf(WIRING_PATHS.audit) === "added") {
      process.stdout.write(`Registered audit entity: ${plan.scaffold.resource}\n`);
    }
    if (statusOf(WIRING_PATHS.routes) === "added") {
      process.stdout.write(`Registered feature: /api/v1/${plan.scaffold.name}\n`);
    } else {
      process.stdout.write(`Feature already registered: /api/v1/${plan.scaffold.name}\n`);
    }
    if (statusOf(WIRING_PATHS.nav) === "added") {
      process.stdout.write(`Added navigation: /${plan.scaffold.name}\n`);
    }
    const enAdded = statusOf(WIRING_PATHS.enUS) === "added";
    const idAdded = statusOf(WIRING_PATHS.idID) === "added";
    if (enAdded && idAdded) {
      process.stdout.write(`Added i18n keys: ${plan.scaffold.name}.* and navigation.${plan.scaffold.name}\n`);
    } else if (enAdded || idAdded) {
      process.stdout.write(`Added the missing ${plan.scaffold.name}.* i18n keys\n`);
    } else {
      process.stdout.write(`i18n keys already present: ${plan.scaffold.name}.*\n`);
    }
    process.stdout.write("Regenerated apps/web/src/routeTree.gen.ts\n");
    process.stdout.write("Next: add the domain fields, then run:\n");
    process.stdout.write("  bun erp db:migrate\n");
    process.stdout.write(`  bun erp test --filter ${plan.scaffold.name}\n`);
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
