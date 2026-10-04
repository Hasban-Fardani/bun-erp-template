/**
 * React Doctor gate for web, mobile and shared UI. `errorCount` always blocks. Some rules are reported as
 * warnings upstream but are treated as blocking here: page complexity is exactly what made
 * the list pages unmaintainable, so it must fail the build rather than scroll past.
 */
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

  // Scan authored source only. `dist` also contains the Cloudflare Worker entry,
  // which necessarily includes server environment names and is not browser code.
  const proc = Bun.spawn(["bunx", "react-doctor", "src", "--no-score", "--json", "--json-compact"], {
    cwd: webDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (code !== 0 || !out.trim()) {
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
