import { CATALOG_APP_KINDS, type CatalogAppKind, installCatalogApp, isCatalogAppKind } from "../lib/app-catalog.ts";
import { isAppInstalled } from "../lib/apps.ts";
import { parseCommandOptions } from "../lib/options.ts";
import { isInteractive, promptChoice } from "../lib/prompt.ts";
import { repoRoot, run } from "../lib/repo.ts";
import { defineCommand } from "../registry.ts";

/** The seven installable combinations (Q24/Q29); the default matches the historical install. */
const COMBINATIONS: ReadonlyArray<{ label: string; apps: readonly CatalogAppKind[] }> = [
  { label: "server", apps: ["server"] },
  { label: "web", apps: ["web"] },
  { label: "mobile", apps: ["mobile"] },
  { label: "server + web (default)", apps: ["server", "web"] },
  { label: "server + mobile", apps: ["server", "mobile"] },
  { label: "web + mobile", apps: ["web", "mobile"] },
  { label: "server + web + mobile", apps: ["server", "web", "mobile"] },
];

const DEFAULT_APPS: readonly CatalogAppKind[] = ["server", "web"];

function parseAppList(value: string): CatalogAppKind[] {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error("--apps requires a comma-separated list, e.g. --apps server,web");
  const apps: CatalogAppKind[] = [];
  for (const part of parts) {
    if (!isCatalogAppKind(part)) {
      throw new Error(`Unknown app "${part}". Use one of: ${CATALOG_APP_KINDS.join(", ")}.`);
    }
    if (!apps.includes(part)) apps.push(part);
  }
  return apps;
}

export const commands = [
  defineCommand("init", async (args) => {
    const parsed = parseCommandOptions(args, { flags: ["yes", "no-agents"], values: ["apps"] });
    const unexpected = parsed.positional[0];
    if (unexpected) throw new Error(`Unexpected argument "${unexpected}". Choose apps with --apps server,web.`);

    const requested = parsed.values.get("apps");
    let apps: readonly CatalogAppKind[];
    if (requested) {
      apps = parseAppList(requested);
    } else if (parsed.flags.has("yes")) {
      apps = DEFAULT_APPS;
    } else if (isInteractive()) {
      apps = promptChoice(
        "Which apps should this project install?",
        COMBINATIONS.map((combination) => ({ label: combination.label, value: combination.apps })),
        DEFAULT_APPS,
      );
    } else {
      process.stderr.write("Usage: bun erp init --apps server,web [--yes]\n");
      process.exit(1);
    }

    const installed: string[] = [];
    // The server installs first so web/mobile can bind its typed contract in the same run (Q30).
    const ordered = [...apps].sort((a, b) => (a === "server" ? -1 : b === "server" ? 1 : 0));
    const hasServer = ordered.includes("server") || (await isAppInstalled("server"));
    for (const kind of ordered) {
      const result = await installCatalogApp(repoRoot, { name: kind, kind, hasServer });
      if (result.created) installed.push(result.dir);
    }
    if (installed.length > 0) process.stdout.write(`Installed apps: ${installed.join(", ")}\n`);
    else process.stdout.write("Apps already installed; nothing to copy.\n");
    if (!hasServer && ordered.some((kind) => kind !== "server")) {
      process.stdout.write(
        "No server app selected: web/mobile ship a detached RPC shell. Run `bun erp init --apps server,... --yes` later to re-fit the typed API client.\n",
      );
    }
    await run(["bun", "install"], "install workspace dependencies");

    if (parsed.flags.has("no-agents")) {
      process.stdout.write("Skipped agent tooling (--no-agents). Run `bun erp init` again to install it.\n");
      return;
    }
    await run(["bun", "cli/tasks/init-agents.ts"], "initialize project agent tooling");
  }),
];
