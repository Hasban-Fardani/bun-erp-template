import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Slop gate: narrative comments + AST findings from the governance validator. slop-ok bypasses it. */
export async function findCodeSlop(root: string): Promise<string[]> {
  const findings: string[] = [];
  const sourceDirs = [join(root, "apps"), join(root, "tools")].filter((dir) => exists(dir));

  for (const dir of sourceDirs) {
    for (const file of tsFiles(dir)) {
      const rel = file.slice(root.length + 1);
      const lines = readFileSync(file, "utf-8").split("\n");

      lines.forEach((line, i) => {
        if (/slop-ok/.test(line)) return;
        for (const rule of [FILE_NARRATION, TYPE_RESTATEMENT]) {
          if (rule.test(line)) {
            findings.push(`${rel}:${i + 1} narrative comment — explain WHY, not WHAT: ${line.trim().slice(0, 70)}`);
          }
        }
      });
    }
  }

  // The governance validator catches cross-file patterns (passthrough, unused export,
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

// Comments must be English (see AGENTS.md), so the patterns are English too. The alternatives
// without a language marker (path-like header comments) are the ones that survive translation.
const FILE_NARRATION =
  /^\s*(\/\/|\*)\s*(This file (contains|holds|manages)|The only place|This is the only|Path to the|Entry point|Renders the)\b/i;
const TYPE_RESTATEMENT = /^\s*\*\s*(Vite entry .* loaded|Value .* used for|Type .* for the)\b/i;

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
