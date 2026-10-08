import { resolve } from "node:path";
import { refreshGuidelines } from "../lib/guidelines.ts";
import { parseCommandOptions } from "../lib/options.ts";
import {
  catalogPackageNames,
  copyCatalogPackage,
  installedPackageNames,
  PACKAGE_CATALOG_DIR,
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
    const asked = parsed.positional.length > 0 ? parsed.positional : [resolveRequired(undefined, "Package name")];
    const names = [...new Set(asked.filter((name): name is string => Boolean(name)))];
    if (names.length === 0) {
      process.stderr.write("Usage: bun erp packages:install <name> [<name>...] [--from <path|git-url>]\n");
      process.exit(1);
    }
    const from = parsed.values.get("from");
    if (from && names.length > 1) throw new Error("--from installs one package; pass a single name with it.");
    // Validate every name first so one typo does not leave the earlier packages half installed.
    for (const name of names) {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("Package name must be kebab-case, e.g. data-table");
      if (!from && !(await Bun.file(resolve(repoRoot, PACKAGE_CATALOG_DIR, name, "package.json")).exists())) {
        const available = await catalogPackageNames(repoRoot);
        throw new Error(
          `No package "${name}" in ${PACKAGE_CATALOG_DIR}.` +
            (available.length > 0 ? ` Available: ${available.join(", ")}` : " The catalog is empty."),
        );
      }
    }

    const installed: string[] = [];
    for (const name of names) {
      if (await Bun.file(resolve(repoRoot, PACKAGES_DIR, name, "package.json")).exists()) {
        process.stdout.write(`packages/${name} is already installed.\n`);
        continue;
      }
      await copyCatalogPackage(repoRoot, name, { from });
      installed.push(name);
    }
    if (installed.length === 0) return;
    await Bun.$`bun install`.quiet();
    if ((await refreshGuidelines(repoRoot)) === "updated") {
      process.stdout.write("Updated AGENTS.md guidelines block.\n");
    }

    for (const name of installed) {
      process.stdout.write(
        `Installed packages/${name}.\n` +
          `Next: add "@bun-erp/${name}": "workspace:*" to the app that needs it, then import from "@bun-erp/${name}".\n`,
      );
    }
  }),
];
