/**
 * Gate React Doctor untuk apps/web. `warningCount` tidak memblokir (kompleksitas halaman
 * daftar itu wajar); `errorCount` memblokir. Peringatan tetap dicetak agar terlihat mata.
 */
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
    return [`react-doctor gagal dijalankan (exit ${code}) — periksa output di atas`];
  }

  const report = JSON.parse(out) as {
    diagnostics?: { rule?: string; severity?: string; filePath?: string; message?: string }[];
    summary?: { errorCount?: number; warningCount?: number };
  };

  const diagnostics = report.diagnostics ?? [];
  for (const d of diagnostics) {
    if (d.severity === "warning") {
      process.stdout.write(`  warn ${d.rule} — ${d.filePath ?? ""}\n`);
    }
  }

  return diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => `${d.filePath ?? "?"}: ${d.rule} — ${d.message ?? "React Doctor error"}`);
}
