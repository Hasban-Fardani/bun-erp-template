import { resolve } from "node:path";
import { isAppInstalled } from "../lib/apps.ts";
import { parseCommandOptions } from "../lib/options.ts";
import { repoRoot, run } from "../lib/repo.ts";
import { toKebabName } from "../lib/scaffolding.ts";
import { defineCommand } from "../registry.ts";

/**
 * Shared-package suites, including opt-in packages. An opt-in package only exists in `packages/`
 * after `bun loom packages:install`, so its suite is skipped while it waits in the catalog.
 */
const SHARED_PACKAGE_TESTS: ReadonlyArray<{ dir: string; label: string }> = [
  { dir: "packages/utils/tests", label: "bun test shared utilities" },
  { dir: "packages/storage/tests", label: "bun test shared storage" },
  { dir: "packages/data-table/tests", label: "bun test shared data table" },
  { dir: "packages/charts/tests", label: "bun test shared charts" },
  { dir: "packages/i18n/tests", label: "bun test i18n" },
  { dir: "packages/editor/tests", label: "bun test rich-text editor" },
  { dir: "packages/email/tests", label: "bun test email components" },
  { dir: "packages/pdf/tests", label: "bun test PDF components" },
  { dir: "packages/mail/tests", label: "bun test mail transport" },
];

export const commands = [
  defineCommand("test", async (args) => {
    const parsed = parseCommandOptions(args, { values: ["filter"] });
    const rawFilter = parsed.values.get("filter");
    const filter = rawFilter === undefined ? undefined : toKebabName(rawFilter, "Feature");
    // A filtered run targets one generated feature's server test; the other suites cannot match it.
    if (filter) {
      if (!(await isAppInstalled("server"))) {
        throw new Error("The server app is not installed; run `bun loom init` first.");
      }
      const path = `apps/server/tests/features/${filter}`;
      process.stdout.write(`Running server feature tests only: ${path}\n`);
      await run(["bun", "apps/server/bootstrap/test-runner.ts", path], `bun test ${filter}`);
      return;
    }

    // `apps/` ships empty: a missing app is a clean skip with the init pointer, never a failed run.
    const appSuites: ReadonlyArray<{ app: string; argv: readonly string[]; label: string }> = [
      { app: "server", argv: ["bun", "apps/server/bootstrap/test-runner.ts"], label: "bun test server" },
      { app: "web", argv: ["bun", "test", "apps/web"], label: "bun test web" },
      { app: "mobile", argv: ["bun", "test", "apps/mobile"], label: "bun test mobile" },
    ];
    const skipped: string[] = [];
    for (const { app, argv, label } of appSuites) {
      if (!(await isAppInstalled(app))) {
        skipped.push(app);
        continue;
      }
      await run([...argv], label);
    }
    if (skipped.length === 3) {
      process.stdout.write("No apps installed (run `bun loom init`); running shared package suites only.\n");
    } else if (skipped.length > 0) {
      process.stdout.write(`Skipped apps not installed: ${skipped.join(", ")}.\n`);
    }
    for (const { dir, label } of SHARED_PACKAGE_TESTS) {
      if (!(await Bun.file(resolve(repoRoot, dir, "../package.json")).exists())) continue;
      await run(["bun", "test", dir], label);
    }
  }),

  defineCommand("ci:prepare", async () => {
    await run(["bun", "cli/tasks/ci-prepare.ts"], "prepare CI");
  }),
  defineCommand("ci:owner", async () => {
    await run(["bun", "cli/tasks/ci-owner.ts"], "create CI owner");
  }),
  defineCommand("wait:http", async (args) => {
    await run(["bun", "cli/tasks/wait-http.ts", ...args], "wait for HTTP");
  }),
];
