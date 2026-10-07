import { join } from "node:path";
import { fileIndex } from "../lib/file-index.ts";
import { run } from "../lib/repo.ts";
import { directoryExists } from "./exists.ts";

/**
 * Impeccable's deterministic design detector — 60 anti-pattern rules for AI-generated UI. The
 * version is pinned so every developer and CI job runs the same rule set.
 */
export const IMPECCABLE_VERSION = "4.1.0";
const IMPECCABLE_PACKAGE = "impeccable";

export function impeccableCommand(...args: string[]): string[] {
  return ["bunx", "--bun", `${IMPECCABLE_PACKAGE}@${IMPECCABLE_VERSION}`, ...args];
}

/**
 * UI surfaces that exist on disk. Catalog apps and packages may be absent (the default template
 * ships no mobile app), and the detector exits 1 when handed a missing target, so only existing
 * directories are scanned. Feature screens come from `templates/features/<name>/web`.
 */
const UI_SURFACES = [
  "apps/web/src",
  "apps/mobile/src",
  "packages/ui/src",
  "templates/apps/web/src",
  "templates/apps/mobile/src",
  "templates/packages/charts/src",
  "templates/packages/data-table/src",
  "templates/packages/editor/src",
  "templates/packages/email/src",
  "templates/packages/pdf/src",
] as const;

export async function impeccableTargets(root: string): Promise<string[]> {
  const candidates: string[] = [...UI_SURFACES];
  for (const feature of await fileIndex(root).files("templates/features/*/web")) {
    candidates.push(feature);
  }

  const targets: string[] = [];
  for (const candidate of candidates.sort()) {
    if (await directoryExists(join(root, candidate))) targets.push(candidate);
  }
  return targets;
}

type ImpeccableRun = { exitCode: number; stdout: string; stderr: string };

async function runImpeccable(argv: string[], root: string): Promise<ImpeccableRun> {
  const result = await run(argv, "impeccable", { cwd: root, stdout: "pipe", stderr: "pipe", check: false });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

/** Human-readable findings go to stderr; stdout carries `--json` output only. */
function reportLines(run: ImpeccableRun): string[] {
  return (run.stderr.trim() || run.stdout.trim())
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

const UNAVAILABLE = `impeccable is unavailable; run bun erp ai:update to install the agent tooling.`;

/**
 * `impeccable detect` exits 0 without primary findings, 2 with them, and 1 when a requested target
 * cannot be scanned. A `--version` probe separates an unavailable engine from a target failure so
 * the finding tells the user which command actually fixes it.
 */
export async function checkImpeccable(root: string): Promise<string[]> {
  const targets = await impeccableTargets(root);
  if (targets.length === 0) return ["No UI surface found to scan; run bun erp init to install an app."];

  let probe: ImpeccableRun;
  try {
    probe = await runImpeccable(impeccableCommand("--version"), root);
  } catch (error) {
    return [`${UNAVAILABLE} (${error instanceof Error ? error.message : String(error)})`];
  }
  if (probe.exitCode !== 0) return [UNAVAILABLE, ...reportLines(probe)];

  let result: ImpeccableRun;
  try {
    result = await runImpeccable(impeccableCommand("detect", ...targets), root);
  } catch (error) {
    return [`${UNAVAILABLE} (${error instanceof Error ? error.message : String(error)})`];
  }

  if (result.exitCode === 0) return [];
  const report = reportLines(result);
  if (result.exitCode === 2) {
    return report.length > 0 ? report : ["impeccable reported design anti-patterns; run it directly for details."];
  }
  return [`impeccable could not scan a target (exit ${result.exitCode}):`, ...report];
}
