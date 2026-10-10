import { join } from "node:path";
import { fileIndex } from "../lib/file-index.ts";
import { directoryExists } from "./exists.ts";

/**
 * Slop gate: stale narrative comments, oversized page components, plus AST findings from the
 * governance validator. `slop-ok: <reason>` on the same line exempts that line; a bare marker
 * without a reason is not an exemption (the governance validator reads the same contract).
 */

/** A page that keeps growing mixes data access, layout and forms in one file. */
const PAGE_MAX_LINES = 220;

/** Matches `governance/slop-validator.ts`: the marker must carry a non-empty reason. */
const SLOP_OK = /slop-ok:\s*\S+/;

export async function findCodeSlop(root: string): Promise<string[]> {
  const findings: string[] = [];
  const index = fileIndex(root);

  for (const rel of await sourceFiles(root)) {
    const lines = (await index.text(rel)).split("\n");

    for (const [index, line] of lines.entries()) {
      if (SLOP_OK.test(line)) continue;
      for (const rule of NARRATIVE_RULES) {
        if (rule.test(line)) {
          findings.push(`${rel}:${index + 1} narrative comment — explain WHY, not WHAT: ${line.trim().slice(0, 70)}`);
        }
      }
    }

    // Page size is checked here rather than by eye: the list pages grew past 400 lines before
    // anyone noticed, and a gate is the only thing that notices early.
    if (
      (rel.startsWith("apps/web/src/pages/") || rel.startsWith("templates/apps/web/src/pages/")) &&
      lines.length > PAGE_MAX_LINES
    ) {
      findings.push(`${rel}: ${lines.length} lines exceeds ${PAGE_MAX_LINES} — extract hooks and row components`);
    }
  }

  findings.push(...(await governanceFindings(root)));
  return findings;
}

/** Everything the repo owns: app source, the CLI, plus catalog packages, apps and features. */
async function sourceFiles(root: string): Promise<string[]> {
  const index = fileIndex(root);
  // Disjoint roots: `cli` already covers `cli/gates`, so listing both scanned those files twice.
  const scanned = await Promise.all(
    ["apps", "packages", "templates/packages", "templates/apps", "templates/features", "cli"].map((dir) =>
      index.files(`${dir}/**/*.{ts,tsx}`),
    ),
  );
  return scanned.flat().filter((p) => !p.includes("node_modules") && !p.endsWith("/routeTree.gen.ts"));
}

/**
 * The governance validator catches cross-file patterns (passthrough, unused export, duplicates)
 * that need an AST. It runs in a Worker thread: the validator stays vendored verbatim (upstream
 * re-sync matters), so its sync IO runs off the gate's shared event loop, and there is still a
 * single source of rules. `slop-worker.ts` mirrors the validator CLI's argument contract.
 */
async function governanceFindings(root: string): Promise<string[]> {
  const validator = join(import.meta.dir, "governance/slop-validator.ts");
  if (!(await Bun.file(validator).exists())) {
    // The validator ships with the repo, so its absence is breakage, not a reason to skip silently.
    return [`slop validator missing at ${validator} — the gate is bundled with the repo`];
  }

  // Explicit source paths, not `apps`: a built `apps/web/dist` is output, and scanning it
  // produced hundreds of nonsense findings about minified bundles. The app paths are optional:
  // apps/* only exists after `bun loom init`, and the catalog copies are scanned while they wait
  // under templates/apps.
  const targetDirs = [
    "apps/server",
    "apps/server/cli",
    "apps/web/src",
    "apps/web/tests",
    "apps/mobile/src",
    "templates/apps/server",
    "templates/apps/web/src",
    "templates/apps/mobile/src",
    "packages/ui/src",
    "cli/gates",
  ];
  const targets: string[] = [];
  for (const dir of targetDirs) {
    if (await directoryExists(join(root, dir))) targets.push(join(root, dir));
  }
  if (targets.length === 0) return [];

  const worker = new Worker(new URL("./governance/slop-worker.ts", import.meta.url).href);
  try {
    const result = await new Promise<{ findings?: string[]; error?: string }>((resolve) => {
      worker.onmessage = (event) => resolve(event.data as { findings?: string[]; error?: string });
      worker.onerror = (event) => resolve({ error: event.message });
      worker.postMessage({ dirs: targets });
    });
    if (result.error !== undefined) return [`slop validator failed: ${result.error}`];
    return result.findings ?? [];
  } finally {
    worker.terminate();
  }
}

/** "This file stores X" restates the file name and rots as soon as the file changes. */
const NARRATIVE_RULES = [
  /^\s*(\/\/|\*)\s*(This file|The only place|This is the only|Sole source)\b/i,
  /^\s*\*\s*(The .+ entry point|The .+ value used by|The .+ type for)\b/i,
];
