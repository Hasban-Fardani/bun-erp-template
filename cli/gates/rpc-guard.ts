/**
 * Runtime imports from the API would bundle its database and authentication implementation.
 * Detection covers `import`/`export` (including `export * from` and no-space forms), dynamic
 * `import(...)` and side-effect `import "..."`; only `type` specifiers are exempt.
 */
export async function checkRpc(root: string): Promise<string[]> {
  const findings: string[] = [];
  for (const app of ["web", "mobile"]) {
    // Mobile waits in the catalog until `bun erp apps:create <name> mobile`; skip it when absent.
    if (!(await Bun.file(`${root}/apps/${app}/package.json`).exists())) continue;
    const sourceRoot = `${root}/apps/${app}/src`;
    for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: sourceRoot })) {
      const source = await Bun.file(`${sourceRoot}/${path}`).text();
      if (!["lib/rpc.ts", "lib/auth.ts"].includes(path) && /["'`]\/api\/v1\//.test(source)) {
        findings.push(`apps/${app}/src/${path}: handwritten API path`);
      }
      for (const match of source.matchAll(/(?:import|export)\b(?!\s+type\b)\s*([\s\S]*?)\s*from\s*["']([^"']+)["']/g)) {
        if (/@bun-erp\/server|apps\/server/.test(match[2] ?? "") && !isTypeOnlySpecifiers(match[1] ?? "")) {
          findings.push(`apps/${app}/src/${path}: server import must use import type`);
        }
      }
      if (
        /import\s*\(\s*["'][^"']*(?:@bun-erp\/server|apps\/server)/.test(source) ||
        /import\s*["'][^"']*(?:@bun-erp\/server|apps\/server)/.test(source)
      ) {
        findings.push(`apps/${app}/src/${path}: dynamic or side-effect server import`);
      }
    }
  }

  // The server app ships empty; without it there is no route tree and no typed contract to guard.
  const hasServer = await Bun.file(`${root}/apps/server/package.json`).exists();
  if (hasServer) {
    const routes = await Bun.file(`${root}/apps/server/routes/api.ts`).text();
    if (!/export const API_PREFIX\s*=\s*"\/api\/v1"/.test(routes)) {
      findings.push("apps/server/routes/api.ts: API_PREFIX must declare the current /api/v1 contract");
    }
  }
  for (const app of ["web", "mobile"]) {
    if (!(await Bun.file(`${root}/apps/${app}/package.json`).exists())) continue;
    // A web app without a backend ships no RPC client, so there is no typed client to verify.
    if (!hasServer) continue;
    const client = await Bun.file(`${root}/apps/${app}/src/lib/rpc.ts`)
      .text()
      .catch(() => "");
    if (!client.includes("hc<AppType>") || !client.includes(".api.v1")) {
      findings.push(`apps/${app}/src/lib/rpc.ts: client must use the typed Hono contract at api.v1`);
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
