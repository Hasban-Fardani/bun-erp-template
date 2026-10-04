/** Local links must keep working when instructions or source files move. */
export async function checkDocs(root: string): Promise<string[]> {
  const findings: string[] = [];
  const patterns = ["*.md", "docs/**/*.md", "skills/**/*.md", "apps/**/README.md"];
  for (const pattern of patterns) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: root })) {
      if (/(?:^|\/)(?:node_modules|dist|www)\//.test(path)) continue;
      const body = await Bun.file(`${root}/${path}`).text();
      for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1]?.trim().replace(/^<|>$/g, "").split("#")[0];
        if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
        const resolved = new URL(target, `file://${root}/${path}`).pathname;
        if (!(await Bun.file(decodeURIComponent(resolved)).exists())) findings.push(`${path}: missing link ${target}`);
      }
    }
  }
  return findings;
}
