import { resolve } from "node:path";
import { requireApps } from "../lib/apps.ts";
import {
  type MakePlan,
  planMakeCommand,
  planMakeEvent,
  planMakeFactory,
  planMakeJob,
  planMakeListener,
  planMakeMail,
  planMakeNotification,
  planMakeTest,
  writeMakePlan,
} from "../lib/make-artifacts.ts";
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

/** Applies a generator plan, formats what it touched and prints one line per file. */
async function applyArtifactPlan(plan: MakePlan, next: readonly string[]): Promise<void> {
  const touched = await writeMakePlan(repoRoot, plan);
  await formatScaffold(touched);
  for (const path of touched) process.stdout.write(`Created or updated: ${path}\n`);
  for (const line of next) process.stdout.write(`${line}\n`);
}

function usage(text: string): never {
  process.stderr.write(`Usage: bun erp ${text}\n`);
  process.exit(1);
}

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
  defineCommand("make:factory", async (args) => {
    await requireApps(["server"]);
    const parsed = parseCommandOptions(args, { values: ["table"] });
    const feature = resolveRequired(parsed.positional[0], "Feature name");
    if (!feature) usage("make:factory <feature> [--table <exportName>]");
    const table = parsed.values.get("table");
    const plan = await planMakeFactory(repoRoot, feature, table ? { table } : {});
    await applyArtifactPlan(plan, [
      "Fill every notNull column that has no default, then use it from tests and seeders.",
    ]);
  }),
  defineCommand("make:job", async (args) => {
    await requireApps(["server"]);
    const name = resolveRequired(args[0], "Job name");
    if (!name || name.startsWith("--")) usage("make:job <name>   (for example invoice.send)");
    const plan = await planMakeJob(repoRoot, name);
    await applyArtifactPlan(plan, [
      "Registered the handler in apps/server/features/jobs.ts.",
      "Next: write the failing handler test, keep the handler idempotent, enqueue inside the write transaction.",
    ]);
  }),
  defineCommand("make:event", async (args) => {
    await requireApps(["server"]);
    const feature = resolveRequired(args[0], "Feature name");
    const name = resolveRequired(args[1], "Event name");
    if (!feature || !name || feature.startsWith("--") || name.startsWith("--")) {
      usage("make:event <feature> <name>   (for example invoices invoice-paid)");
    }
    const plan = await planMakeEvent(repoRoot, feature, name);
    await applyArtifactPlan(plan, [
      "Dispatch it inside the write transaction: dispatch(tx, event, payload, { idempotencyKey }).",
      `Next: bun erp make:listener ${feature} <listener> --event ${name}`,
    ]);
  }),
  defineCommand("make:listener", async (args) => {
    await requireApps(["server"]);
    const parsed = parseCommandOptions(args, { values: ["event"] });
    const feature = resolveRequired(parsed.positional[0], "Feature name");
    const name = resolveRequired(parsed.positional[1], "Listener name");
    const event = parsed.values.get("event");
    if (!feature || !name || !event) usage("make:listener <feature> <name> --event <event>");
    const plan = await planMakeListener(repoRoot, feature, name, { event });
    await applyArtifactPlan(plan, [
      "Registered the listener in apps/server/features/events.ts.",
      "Next: write the failing handler test, keep the handler idempotent (delivery is at-least-once).",
    ]);
  }),
  defineCommand("make:command", async (args) => {
    await requireApps(["server"]);
    const name = resolveRequired(args[0], "Command name");
    if (!name || name.startsWith("--")) usage("make:command <group:name>   (for example invoices:export)");
    const plan = await planMakeCommand(repoRoot, name);
    await applyArtifactPlan(plan, [
      'The command registry discovers it automatically; add a summary in cli/lib/help.ts to move it out of "Other".',
    ]);
  }),
  defineCommand("make:test", async (args) => {
    await requireApps(["server"]);
    const feature = resolveRequired(args[0], "Feature name");
    if (!feature || feature.startsWith("--")) usage("make:test <feature> [name]");
    const plan = await planMakeTest(repoRoot, feature, args[1]);
    await applyArtifactPlan(plan, [`Next: bun erp test --filter ${feature}`]);
  }),
  defineCommand("make:notification", async (args) => {
    await requireApps(["server"]);
    const parsed = parseCommandOptions(args, { values: ["type"] });
    const name = resolveRequired(parsed.positional[0], "Notification name");
    if (!name) usage("make:notification <name> [--type <domain.event>]   (for example invoice-paid)");
    const type = parsed.values.get("type");
    const plan = await planMakeNotification(repoRoot, name, type ? { type } : {});
    await applyArtifactPlan(plan, [
      "Exported from apps/server/features/notifications/index.ts; call it from your feature.",
    ]);
  }),
  defineCommand("make:mail", async (args) => {
    await requireApps(["server"]);
    const name = resolveRequired(args[0], "Mail name");
    if (!name || name.startsWith("--")) usage("make:mail <name>");
    const plan = await planMakeMail(repoRoot, name);
    await applyArtifactPlan(plan, [
      "Queue it with ctx.mail through the generated queue helper; keep the idempotency key stable.",
    ]);
  }),
];
