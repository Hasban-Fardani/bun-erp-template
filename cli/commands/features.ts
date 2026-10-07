import { resolve } from "node:path";
import { requireApps } from "../lib/apps.ts";
import {
  catalogFeatureNames,
  installedFeatureNames,
  migrationBaseName,
  planFeatureInstall,
  readFeatureManifest,
} from "../lib/feature-catalog.ts";
import { planFeatureWiring } from "../lib/feature-wiring.ts";
import { fileIndex } from "../lib/file-index.ts";
import { refreshGuidelines } from "../lib/guidelines.ts";
import { planInfraWiring } from "../lib/infra-wiring.ts";
import { parseCommandOptions } from "../lib/options.ts";
import { copyCatalogPackage, ensureWorkspaceDependency } from "../lib/package-catalog.ts";
import { resolveRequired } from "../lib/prompt.ts";
import { MIGRATIONS_DIR, repoRoot } from "../lib/repo.ts";
import { formatScaffold, regenerateWebRouteTree, writeScaffold } from "../lib/scaffold.ts";
import { nextMigrationFile, toPascalName } from "../lib/scaffolding.ts";
import { assertWiringAnchors } from "../lib/wiring.ts";
import { defineCommand } from "../registry.ts";

const WEB_MANIFEST = "apps/web/package.json";
const SERVER_MANIFEST = "apps/server/package.json";

export const commands = [
  defineCommand("features:list", async () => {
    const catalog = await catalogFeatureNames(repoRoot);
    const installed = await installedFeatureNames(repoRoot);
    process.stdout.write(`Installed: ${installed.length > 0 ? installed.join(", ") : "(none)"}\n`);
    const available = catalog.filter((name) => !installed.includes(name));
    process.stdout.write(`Available: ${available.length > 0 ? available.join(", ") : "(none)"}\n`);
  }),

  defineCommand("features:install", async (args) => {
    const parsed = parseCommandOptions(args, {});
    const name = resolveRequired(parsed.positional[0], "Feature name");
    if (!name) {
      process.stderr.write("Usage: bun erp features:install <name>\n");
      process.exit(1);
    }

    const manifest = await readFeatureManifest(repoRoot, name);
    // A server feature wires the API and the screen; a web feature only needs the web app.
    await requireApps(manifest.kind === "web" ? ["web"] : ["server", "web"]);
    if ((await installedFeatureNames(repoRoot)).includes(name)) {
      throw new Error(`Feature "${name}" is already installed; remove it before reinstalling.`);
    }
    const plan = planFeatureInstall(manifest);
    const skipped: string[] = [];
    for (const entry of plan) {
      if (!(await Bun.file(resolve(repoRoot, entry.destination)).exists())) continue;
      // Shared helpers are copied once and reused by every catalog feature that needs them.
      if (entry.skipIfPresent) {
        skipped.push(entry.destination);
        continue;
      }
      throw new Error(`Refusing to overwrite existing file: ${entry.destination}`);
    }

    // Compute every wiring edit before writing anything: a missing anchor fails the install
    // instead of leaving a half-wired feature behind.
    const pascal = toPascalName(manifest.name);
    const camel = `${pascal[0]?.toLowerCase() ?? ""}${pascal.slice(1)}`;
    const wiring =
      manifest.kind === "infra"
        ? await planInfraWiring(repoRoot, manifest)
        : await planFeatureWiring(
            repoRoot,
            { name: manifest.name, camel },
            {
              ...(manifest.kind === "server"
                ? {
                    server: {
                      resource: manifest.permissionResource,
                      auditEntity: manifest.auditEntity,
                      auditFields: manifest.auditFields,
                    },
                  }
                : {}),
              nav: manifest.nav,
              i18nKeys: manifest.i18nKeys,
            },
          );
    assertWiringAnchors(wiring);

    // A feature may need an opt-in package. Install the catalog package and declare the workspace
    // dependency before any file is written, so the build that follows resolves every import.
    // Infra features wire the server, so their package dependency lands on apps/server; the web
    // features that need a rendering package declare it on apps/web.
    const requiresManifest = manifest.kind === "infra" ? SERVER_MANIFEST : WEB_MANIFEST;
    const installedPackages: string[] = [];
    let dependencyAdded = false;
    for (const pkg of manifest.requires) {
      if (!(await Bun.file(resolve(repoRoot, "packages", pkg, "package.json")).exists())) {
        await copyCatalogPackage(repoRoot, pkg);
        installedPackages.push(pkg);
      }
      if (await ensureWorkspaceDependency(repoRoot, requiresManifest, `@bun-erp/${pkg}`)) dependencyAdded = true;
    }
    if (installedPackages.length > 0 || dependencyAdded) await Bun.$`bun install`.quiet();

    const catalogDir = resolve(repoRoot, "templates/features", name);
    // Shared helpers are catalog-root relative; everything else sits under the feature directory.
    const catalogRoot = resolve(repoRoot, "templates/features");
    const written: string[] = [];
    for (const entry of plan) {
      if (skipped.includes(entry.destination)) continue;
      const base = entry.source.startsWith("_shared/") ? catalogRoot : catalogDir;
      await writeScaffold(resolve(repoRoot, entry.destination), await Bun.file(resolve(base, entry.source)).text());
      written.push(entry.destination);
    }

    const migrationPaths: string[] = [];
    // Server and infra features create tables; a web feature never ships a migration.
    if (manifest.kind !== "web" && manifest.migrations && manifest.migrations.length > 0) {
      const existing = (await fileIndex(repoRoot).files("apps/server/database/migrations/*.ts")).map(
        (file) => file.split("/").at(-1) ?? "",
      );
      for (const source of manifest.migrations) {
        // Catalog names carry their own number (0002_departments); the installer renumbers
        // the file to the app's next free slot.
        const file = nextMigrationFile(existing, migrationBaseName(source));
        await writeScaffold(resolve(MIGRATIONS_DIR, file), await Bun.file(resolve(catalogDir, source)).text());
        existing.push(file);
        migrationPaths.push(`apps/server/database/migrations/${file}`);
      }
    }

    const touched: string[] = [];
    for (const entry of wiring) {
      if (entry.status !== "added") continue;
      await Bun.write(resolve(repoRoot, entry.path), entry.source);
      touched.push(entry.path);
    }

    await formatScaffold([...written, ...migrationPaths, ...touched]);
    // An infra feature ships no web files, so the typed route tree cannot change.
    if (manifest.kind !== "infra") {
      // The typed route tree must list the new page or createFileRoute fails the types gate.
      await regenerateWebRouteTree();
    }

    const root = manifest.kind === "web" ? `apps/web/src/features/${name}` : `apps/server/features/${name}`;
    process.stdout.write(`Installed feature (${manifest.kind}): ${root}\n`);
    for (const path of written) process.stdout.write(`  ${path}\n`);
    for (const path of skipped) process.stdout.write(`  kept existing shared helper: ${path}\n`);
    for (const path of migrationPaths) process.stdout.write(`Created migration: ${path}\n`);
    for (const pkg of installedPackages) process.stdout.write(`Installed package: packages/${pkg}\n`);
    if (manifest.kind === "server") {
      process.stdout.write(`Registered permissions: ${manifest.permissionResource}.*\n`);
      process.stdout.write(`Registered audit entity: ${manifest.auditEntity}\n`);
      process.stdout.write(`Registered feature: /api/v1/${name}\n`);
    }
    if (manifest.kind === "infra") {
      for (const entry of wiring) process.stdout.write(`Wired: ${entry.path}\n`);
    } else {
      process.stdout.write(`Added navigation: ${manifest.nav.url}\n`);
      process.stdout.write(`Added i18n keys: ${manifest.name}.* and ${manifest.nav.titleKey}\n`);
      process.stdout.write("Regenerated apps/web/src/routeTree.gen.ts\n");
    }
    if ((await refreshGuidelines(repoRoot)) === "updated") {
      process.stdout.write("Updated AGENTS.md guidelines block.\n");
    }
    process.stdout.write("Next: run bun erp check before using it.\n");
  }),
];
