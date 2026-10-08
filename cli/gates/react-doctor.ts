/**
 * React Doctor gate for web, mobile and shared UI. `errorCount` always blocks. Some rules are reported as
 * warnings upstream but are treated as blocking here: page complexity is exactly what made
 * the list pages unmaintainable, so it must fail the build rather than scroll past.
 */
import { join } from "node:path";
import { run } from "../lib/repo.ts";

const BLOCKING_WARNING_RULES = new Set(["no-high-complexity-react-function"]);

export async function findReactDoctorIssues(root: string): Promise<string[]> {
  const results = await Promise.all(
    ["apps/web", "apps/mobile", "packages/ui"].map((directory) => inspectReact(root, directory)),
  );
  return results.flat();
}

async function inspectReact(root: string, directory: string): Promise<string[]> {
  const webDir = `${root}/${directory}`;
  if (!(await Bun.file(`${webDir}/package.json`).exists())) return [];

  // The pinned root devDependency, not `bunx react-doctor`: a bare bunx can resolve another
  // version and reach the network on every run.
  const binary = join(root, "node_modules/.bin/react-doctor");
  if (!(await Bun.file(binary).exists())) {
    return [`react-doctor is not installed at ${binary} — run bun install.`];
  }

  // Scan authored source only. `dist` also contains the Cloudflare Worker entry,
  // which necessarily includes server environment names and is not browser code.
  const result = await run([binary, "src", "--no-score", "--json", "--json-compact"], "react-doctor", {
    cwd: webDir,
    stdout: "pipe",
    stderr: "pipe",
    check: false,
  });
  const { stdout: out, stderr: err, exitCode: code } = result;

  // react-doctor exits 1 when it reports errors; only a run without a JSON report is a crash.
  if (!out.trim().startsWith("{")) {
    return [`react-doctor failed to run (exit ${code}) — ${err.trim() || out.trim() || "no output"}`];
  }

  const report = JSON.parse(out) as {
    diagnostics?: { rule?: string; severity?: string; filePath?: string; message?: string }[];
  };
  const diagnostics = report.diagnostics ?? [];

  for (const d of diagnostics) {
    if (d.severity === "warning" && !BLOCKING_WARNING_RULES.has(d.rule ?? "")) {
      process.stdout.write(`  warn ${d.rule} — ${directory}/${d.filePath ?? ""}\n`);
    }
  }

  return diagnostics
    .filter((d) => d.severity === "error" || BLOCKING_WARNING_RULES.has(d.rule ?? ""))
    .map((d) => `${directory}/${d.filePath ?? "?"}: ${d.rule} — ${d.message ?? "React Doctor finding"}`);
}
