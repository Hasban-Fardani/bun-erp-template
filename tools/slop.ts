import { join } from "node:path";

/**
 * Slop gate: stale narrative comments, oversized page components, plus AST findings from the
 * governance validator. `slop-ok: <reason>` exempts the next line.
 */

/** A page that keeps growing mixes data access, layout and forms in one file. */
const PAGE_MAX_LINES = 220;

export async function findCodeSlop(root: string): Promise<string[]> {
  const findings: string[] = [];

  for (const rel of sourceFiles(root)) {
    const lines = (await Bun.file(join(root, rel)).text()).split("\n");

    for (const [index, line] of lines.entries()) {
      if (/slop-ok/.test(line)) continue;
      for (const rule of NARRATIVE_RULES) {
        if (rule.test(line)) {
          findings.push(`${rel}:${index + 1} narrative comment — explain WHY, not WHAT: ${line.trim().slice(0, 70)}`);
        }
      }
    }

    // Page size is checked here rather than by eye: the list pages grew past 400 lines before
    // anyone noticed, and a gate is the only thing that notices early.
    if (rel.startsWith("apps/web/src/pages/") && lines.length > PAGE_MAX_LINES) {
      findings.push(`${rel}: ${lines.length} lines exceeds ${PAGE_MAX_LINES} — extract hooks and row components`);
    }
  }

  findings.push(...(await governanceFindings(root)));
  return findings;
}

/** Everything the repo owns: app source plus the CLI's own tools. */
function sourceFiles(root: string): string[] {
  return ["apps", "tools"].flatMap((dir) =>
    [...new Bun.Glob(`${dir}/**/*.{ts,tsx}`).scanSync({ cwd: root })].filter((p) => !p.includes("node_modules")),
  );
}

/**
 * The governance validator catches cross-file patterns (passthrough, unused export, duplicates)
 * that need an AST. It runs as a subprocess so there is a single source of rules.
 */
async function governanceFindings(root: string): Promise<string[]> {
  const validator = "/root/programming-governance/adapters/slop-validator.ts";
  if (!(await Bun.file(validator).exists())) return [];

  // Explicit source paths, not `apps`: a built `apps/web/dist` is output, and scanning it
  // produced hundreds of nonsense findings about minified bundles.
  const targets = ["apps/server", "apps/web/src", "apps/web/tests", "tools"].map((p) => join(root, p));
  const proc = Bun.spawn(["bun", validator, ...targets], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code === 0) return [];
  return out
    .split("\n")
    .filter((line) => /^[A-Z_]+ /.test(line))
    .map((line) => line.trim());
}

/** "This file stores X" restates the file name and rots as soon as the file changes. */
const NARRATIVE_RULES = [
  /^\s*(\/\/|\*)\s*(This file|The only place|This is the only|Sole source)\b/i,
  /^\s*\*\s*(The .+ entry point|The .+ value used by|The .+ type for)\b/i,
];
