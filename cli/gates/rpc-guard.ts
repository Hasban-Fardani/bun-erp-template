import { directoryExists } from "./exists.ts";

/**
 * Library defaults an agent writes from memory. Each bypasses the shared env type, the 422 error
 * envelope, the OpenAPI responses or the `{ data, meta }` envelope the web `call()` unwraps.
 * `c.body()` stays allowed for binary and 304 responses.
 */
const FEATURE_HONO_RULES: readonly (readonly [RegExp, string])[] = [
  [/\bnew Hono\s*[<(]/, "use factory.createApp() from http/factory.ts, not new Hono()"],
  [/\bzValidator\b|@hono\/zod-validator/, "use validate() from http/helpers/validate.ts, not zValidator"],
  [/\bdescribeRoute\s*\(/, "use doc() from http/helpers/api-docs.ts, not describeRoute"],
  [/\bc\.json\s*\(/, "return ok(c, data) or throw ApiError, not c.json()"],
];

/**
 * Runtime imports from the API would bundle its database and authentication implementation.
 * Detection covers `import`/`export` (including `export * from` and no-space forms), dynamic
 * `import(...)` and side-effect `import "..."`; only `type` specifiers are exempt.
 */
export async function checkRpc(root: string): Promise<string[]> {
  const findings: string[] = [];
  for (const app of ["web", "mobile"]) {
    // Mobile waits in the catalog until `bun loom apps:create <name> mobile`; skip it when absent.
    if (!(await Bun.file(`${root}/apps/${app}/package.json`).exists())) continue;
    const sourceRoot = `${root}/apps/${app}/src`;
    for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: sourceRoot })) {
      const source = await Bun.file(`${sourceRoot}/${path}`).text();
      if (!["lib/rpc.ts", "lib/auth.ts"].includes(path) && /["'`]\/api\/v1\//.test(source)) {
        findings.push(`apps/${app}/src/${path}: handwritten API path`);
      }
      for (const match of source.matchAll(/(?:import|export)\b(?!\s+type\b)\s*([\s\S]*?)\s*from\s*["']([^"']+)["']/g)) {
        if (/@loom\/server|apps\/server/.test(match[2] ?? "") && !isTypeOnlySpecifiers(match[1] ?? "")) {
          findings.push(`apps/${app}/src/${path}: server import must use import type`);
        }
      }
      if (
        /import\s*\(\s*["'][^"']*(?:@loom\/server|apps\/server)/.test(source) ||
        /import\s*["'][^"']*(?:@loom\/server|apps\/server)/.test(source)
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
    const featureRoot = `${root}/apps/server/features`;
    // A server scaffolded by `apps:create` may have no features yet; scanning a missing directory throws.
    const features = (await directoryExists(featureRoot)) ? new Bun.Glob("**/*.ts").scan({ cwd: featureRoot }) : [];
    for await (const path of features) {
      const source = await Bun.file(`${featureRoot}/${path}`).text();
      for (const [pattern, rule] of FEATURE_HONO_RULES) {
        if (pattern.test(source)) findings.push(`apps/server/features/${path}: ${rule}`);
      }
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
