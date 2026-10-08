import { isTemplateRepo } from "../gates/lifecycle.ts";
import { CATALOG_APP_KINDS, type CatalogAppKind, installCatalogApp, isCatalogAppKind } from "../lib/app-catalog.ts";
import { isAppInstalled } from "../lib/apps.ts";
import { refreshGuidelines } from "../lib/guidelines.ts";
import { parseCommandOptions } from "../lib/options.ts";
import { isInteractive, promptChoice, resolveRequired } from "../lib/prompt.ts";
import { repoRoot, run } from "../lib/repo.ts";
import { defineCommand } from "../registry.ts";
import { adoptProject } from "./project.ts";

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

/**
 * A fresh fork can become a project in the same run; CI and scripts get the command to run
 * instead, because adoption needs a project name and purpose.
 */
async function offerProjectAdoption(): Promise<void> {
  if (!(await isTemplateRepo(repoRoot))) return;
  const adoptNow = isInteractive()
    ? promptChoice(
        "Configure this fork as a project now?",
        [
          { label: "Yes — set the project name and purpose", value: true },
          { label: "No — keep it as the template repository", value: false },
        ],
        false,
      )
    : false;
  if (!adoptNow) {
    process.stdout.write(
      'Still the template repository. Run `bun erp project:adopt --name <name> --purpose "<one line>"` to configure this fork as a project.\n',
    );
    return;
  }
  const name = resolveRequired(undefined, "Project name");
  const purpose = resolveRequired(undefined, "Project purpose (one line)");
  if (!name || !purpose) throw new Error('Usage: bun erp project:adopt --name <name> --purpose "<one line>"');
  await adoptProject(repoRoot, { name, purpose });
  process.stdout.write(`Adopted "${name}" as a project.\n`);
}

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
      throw new Error("Usage: bun erp init --apps server,web [--yes]");
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
    // The committed guidelines block is state-neutral; init is one of the two places that
    // regenerates it for the catalog this project actually installed.
    await refreshGuidelines(repoRoot);

    if (parsed.flags.has("no-agents")) {
      process.stdout.write("Skipped agent tooling (--no-agents). Run `bun erp init` again to install it.\n");
      await offerProjectAdoption();
      return;
    }
    await run(["bun", "cli/tasks/init-agents.ts"], "initialize project agent tooling");
    await offerProjectAdoption();
  }),
];
