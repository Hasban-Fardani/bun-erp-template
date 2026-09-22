import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Slop gate: stale narrative comments, oversized page components, plus AST findings from the
 * governance validator. `slop-ok: <reason>` exempts the next line.
 */

/** A page that keeps growing mixes data access, layout and forms in one file. */
const PAGE_MAX_LINES = 220;

export async function findCodeSlop(root: string): Promise<string[]> {
  const findings: string[] = [];
  const sourceDirs = [join(root, "apps"), join(root, "tools")].filter((dir) => exists(dir));

  for (const dir of sourceDirs) {
    for (const file of tsFiles(dir)) {
      const rel = file.slice(root.length + 1);
      const lines = readFileSync(file, "utf-8").split("\n");

      lines.forEach((line, i) => {
        if (/slop-ok/.test(line)) return;
        for (const rule of NARRATIVE_RULES) {
          if (rule.test(line)) {
            findings.push(`${rel}:${i + 1} narrative comment — explain WHY, not WHAT: ${line.trim().slice(0, 70)}`);
          }
        }
      });

      // Page size is checked here rather than by eye: the list pages grew past 400 lines
      // before anyone noticed, and a gate is the only thing that notices early.
      if (rel.startsWith("apps/web/src/pages/") && lines.length > PAGE_MAX_LINES) {
        findings.push(`${rel}: ${lines.length} lines exceeds ${PAGE_MAX_LINES} — extract hooks and row components`);
      }
    }
  }

  // The governance validator catches cross-file patterns (passthrough, unused exports,
  // duplicates) that need an AST — run as a subprocess so there is one rule source.
  const validator = "/root/programming-governance/adapters/slop-validator.ts";
  if (exists(validator)) {
    const proc = Bun.spawn(["bun", validator, join(root, "apps"), join(root, "tools")], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (code !== 0) {
      for (const line of out.split("\n")) {
        if (/^[A-Z_]+ /.test(line)) findings.push(line.trim());
      }
    }
  }

  return findings;
}

/** "This file stores X" restates the file name and rots as soon as the file changes. */
const NARRATIVE_RULES = [
  /^\s*(\/\/|\*)\s*(This file|The only place|This is the only|Sole source)\b/i,
  /^\s*\*\s*(The .+ entry point|The .+ value used by|The .+ type for)\b/i,
];

function exists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (path.includes("node_modules")) continue;
    if (statSync(path).isDirectory()) tsFiles(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}
