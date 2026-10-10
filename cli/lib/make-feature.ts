import { resolve } from "node:path";
import { planFeatureWiring } from "./feature-wiring.ts";
import { fileIndex } from "./file-index.ts";
import { copyCatalogPackage, ensureWorkspaceDependency } from "./package-catalog.ts";
import { writeScaffold } from "./scaffold.ts";
import {
  type FeatureScaffold,
  type FeatureScaffoldOptions,
  nextMigrationFile,
  renderFeatureScaffold,
  renderMigrationSource,
  renderWebFeatureScaffold,
} from "./scaffolding.ts";
import { assertWiringAnchors, type WiringEdit } from "./wiring.ts";

/**
 * `make:feature` planning and application. The plan validates every anchor and every target path
 * before anything is written, so a missing anchor cannot leave a half-wired feature behind. The
 * command renders the plan, then applies it; tests exercise the same two steps on a fixture root.
 */

export type MakeFeaturePlan = {
  scaffold: FeatureScaffold;
  web: { files: ReadonlyArray<{ path: string; contents: string }> };
  migration: { path: string; source: string };
  wiring: WiringEdit[];
};

export async function planMakeFeature(
  root: string,
  rawName: string,
  options: FeatureScaffoldOptions = {},
): Promise<MakeFeaturePlan> {
  const scaffold = renderFeatureScaffold(rawName, options);
  const web = renderWebFeatureScaffold(scaffold);
  for (const file of [...scaffold.files, ...web.files]) {
    if (await Bun.file(resolve(root, file.path)).exists()) {
      throw new Error(`Refusing to overwrite existing file: ${file.path}`);
    }
  }

  const existing = (await fileIndex(root).files("apps/server/database/migrations/*.ts")).map(
    (file) => file.split("/").at(-1) ?? "",
  );
  const migrationFile = nextMigrationFile(existing, `create_${scaffold.table}_table`);

  // Plan every wiring edit before writing anything: a missing anchor aborts the whole command.
  const wiring = await planFeatureWiring(
    root,
    { name: scaffold.name, camel: scaffold.camel },
    { server: { resource: scaffold.resource } },
  );
  assertWiringAnchors(wiring, "create the feature; cannot wire");

  return {
    scaffold,
    web,
    migration: {
      path: `apps/server/database/migrations/${migrationFile}`,
      source: renderMigrationSource({
        mode: "create",
        table: scaffold.table,
        numbering: options.sequence !== undefined,
        softDelete: options.softDelete === true,
        version: options.version !== false,
      }),
    },
    wiring,
  };
}

/** Writes the planned scaffold, migration and wiring edits; returns every touched repo path. */
export async function writeMakeFeature(root: string, plan: MakeFeaturePlan): Promise<string[]> {
  const touched: string[] = [];
  for (const file of [...plan.scaffold.files, ...plan.web.files]) {
    await writeScaffold(resolve(root, file.path), file.contents);
    touched.push(file.path);
  }
  await writeScaffold(resolve(root, plan.migration.path), plan.migration.source);
  touched.push(plan.migration.path);
  for (const edit of plan.wiring) {
    if (edit.status !== "added") continue;
    await Bun.write(resolve(root, edit.path), edit.source);
    touched.push(edit.path);
  }
  return touched;
}

const WEB_MANIFEST = "apps/web/package.json";
const SHARED_WEB_HELPERS = ["use-table-state.ts", "resource-table-labels.ts"] as const;

export type FeatureWebDependencies = {
  /** True when a catalog package or workspace dependency was added; the caller runs `bun install`. */
  changed: boolean;
  /** Repo-relative paths of copied shared helpers, so the caller can format them. */
  written: string[];
};

/**
 * The generated web screen lists rows through the opt-in data-table package and the shared table
 * helpers. Install the catalog package, declare the app dependency, and copy the helpers before any
 * feature file is written, mirroring `features:install`; a second feature finds them already there.
 */
export async function ensureFeatureWebDependencies(root: string): Promise<FeatureWebDependencies> {
  const written: string[] = [];
  let changed = false;
  if (!(await Bun.file(resolve(root, "packages/data-table/package.json")).exists())) {
    await copyCatalogPackage(root, "data-table");
    changed = true;
  }
  if (await ensureWorkspaceDependency(root, WEB_MANIFEST, "@loom/data-table")) changed = true;
  for (const helper of SHARED_WEB_HELPERS) {
    const destination = `apps/web/src/lib/${helper}`;
    if (await Bun.file(resolve(root, destination)).exists()) continue;
    await writeScaffold(
      resolve(root, destination),
      await Bun.file(resolve(root, "templates/features/_shared/web", helper)).text(),
    );
    written.push(destination);
  }
  return { changed, written };
}
