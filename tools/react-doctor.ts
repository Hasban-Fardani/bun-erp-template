/**
 * React Doctor gate for apps/web. `errorCount` always blocks. Some rules are reported as
 * warnings upstream but are treated as blocking here: page complexity is exactly what made
 * the list pages unmaintainable, so it must fail the build rather than scroll past.
 */
const BLOCKING_WARNING_RULES = new Set(["no-high-complexity-react-function"]);

export async function findReactDoctorIssues(root: string): Promise<string[]> {
  const webDir = `${root}/apps/web`;
  if (!(await Bun.file(`${webDir}/package.json`).exists())) return [];

  const proc = Bun.spawn(["bunx", "react-doctor@latest", ".", "--no-score", "--json", "--json-compact"], {
    cwd: webDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

  if (code !== 0 || !out.trim()) {
    return [`react-doctor failed to run (exit ${code}) — check the output above`];
  }

  const report = JSON.parse(out) as {
    diagnostics?: { rule?: string; severity?: string; filePath?: string; message?: string }[];
  };
  const diagnostics = report.diagnostics ?? [];

  for (const d of diagnostics) {
    if (d.severity === "warning" && !BLOCKING_WARNING_RULES.has(d.rule ?? "")) {
      process.stdout.write(`  warn ${d.rule} — ${d.filePath ?? ""}\n`);
    }
  }

  return diagnostics
    .filter((d) => d.severity === "error" || BLOCKING_WARNING_RULES.has(d.rule ?? ""))
    .map((d) => `${d.filePath ?? "?"}: ${d.rule} — ${d.message ?? "React Doctor finding"}`);
}
