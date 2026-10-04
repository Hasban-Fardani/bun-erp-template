/** Runtime imports from the API would bundle its database and authentication implementation. */
export async function checkRpc(root: string): Promise<string[]> {
  const findings: string[] = [];
  for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: `${root}/apps/web/src` })) {
    const source = await Bun.file(`${root}/apps/web/src/${path}`).text();
    if (!["lib/rpc.ts", "lib/auth.ts"].includes(path) && /["'`]\/api\/v1\//.test(source)) {
      findings.push(`${path}: handwritten API path`);
    }
    for (const match of source.matchAll(/(?:import|export)\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
      if (/@bun-erp\/server|apps\/server/.test(match[2] ?? "") && !isTypeOnlySpecifiers(match[1] ?? "")) {
        findings.push(`${path}: server import must use import type`);
      }
    }
    if (
      /import\s*\(\s*["'][^"']*(?:@bun-erp\/server|apps\/server)/.test(source) ||
      /import\s+["'][^"']*(?:@bun-erp\/server|apps\/server)/.test(source)
    ) {
      findings.push(`${path}: dynamic or side-effect server import`);
    }
  }
  return findings;
}

function isTypeOnlySpecifiers(specifiers: string): boolean {
  const named = /^\s*\{([^}]+)\}\s*$/.exec(specifiers)?.[1];
  return (
    named
      ?.split(",")
      .filter((part) => part.trim())
      .every((part) => /^\s*type\s+\w+(?:\s+as\s+\w+)?\s*$/.test(part)) ?? false
  );
}
