import { fileIndex } from "../lib/file-index.ts";

/** Local links must keep working when instructions or source files move. */
export async function checkDocs(root: string): Promise<string[]> {
  const findings: string[] = [];
  const index = fileIndex(root);
  const patterns = ["*.md", "docs/**/*.md", "skills/**/*.md", "apps/**/README.md", "packages/**/README.md"];
  for (const path of await index.files(patterns)) {
    if (/(?:^|\/)(?:node_modules|dist|www)\//.test(path)) continue;
    const body = await index.text(path);
    for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1]?.trim().replace(/^<|>$/g, "").split("#")[0];
      if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
      const resolved = new URL(target, `file://${root}/${path}`).pathname;
      if (!(await Bun.file(decodeURIComponent(resolved)).exists())) findings.push(`${path}: missing link ${target}`);
    }
  }
  for (const manifestPath of await index.files("packages/*/package.json")) {
    const manifest = JSON.parse(await index.text(manifestPath)) as { name?: string };
    const packagePath = manifestPath.replace(/\/package\.json$/, "");
    const llmsPath = `${root}/${packagePath}/llms.txt`;
    if (!(await Bun.file(llmsPath).exists())) {
      findings.push(`${packagePath}: missing llms.txt package guide`);
      continue;
    }
    const llms = await index.text(`${packagePath}/llms.txt`);
    if (manifest.name && !llms.includes(manifest.name)) {
      findings.push(`${packagePath}/llms.txt: package name does not match ${manifest.name}`);
    }
  }
  return findings;
}
