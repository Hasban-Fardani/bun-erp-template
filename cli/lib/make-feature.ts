import { resolve } from "node:path";
import { planFeatureWiring } from "./feature-wiring.ts";
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

  const migrationsDir = resolve(root, "apps/server/database/migrations");
  const existing = [...new Bun.Glob("*.ts").scanSync({ cwd: migrationsDir })];
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
