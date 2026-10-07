import { resolve } from "node:path";
import { refreshGuidelines } from "../lib/guidelines.ts";
import { parseCommandOptions } from "../lib/options.ts";
import {
  catalogPackageNames,
  copyCatalogPackage,
  installedPackageNames,
  PACKAGES_DIR,
} from "../lib/package-catalog.ts";
import { resolveRequired } from "../lib/prompt.ts";
import { repoRoot } from "../lib/repo.ts";
import { defineCommand } from "../registry.ts";

export const commands = [
  defineCommand("packages:list", async () => {
    const catalog = await catalogPackageNames(repoRoot);
    const installed = await installedPackageNames(repoRoot);
    process.stdout.write(`Installed: ${installed.length > 0 ? installed.join(", ") : "(none)"}\n`);
    const available = catalog.filter((name) => !installed.includes(name));
    process.stdout.write(`Available: ${available.length > 0 ? available.join(", ") : "(none)"}\n`);
  }),

  defineCommand("packages:install", async (args) => {
    const parsed = parseCommandOptions(args, { values: ["from"] });
    const name = resolveRequired(parsed.positional[0], "Package name");
    if (!name) {
      process.stderr.write("Usage: bun erp packages:install <name> [--from <path|git-url>]\n");
      process.exit(1);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("Package name must be kebab-case, e.g. data-table");

    if (await Bun.file(resolve(repoRoot, PACKAGES_DIR, name, "package.json")).exists()) {
      process.stdout.write(`packages/${name} is already installed.\n`);
      return;
    }

    await copyCatalogPackage(repoRoot, name, { from: parsed.values.get("from") });
    await Bun.$`bun install`.quiet();
    if ((await refreshGuidelines(repoRoot)) === "updated") {
      process.stdout.write("Updated AGENTS.md guidelines block.\n");
    }

    process.stdout.write(
      `Installed packages/${name}.\n` +
        `Next: add "@bun-erp/${name}": "workspace:*" to the app that needs it, then import from "@bun-erp/${name}".\n`,
    );
  }),
];
