import { Glob } from "bun";

/**
 * Platform gate: keeps the repo on Bun and off Node built-ins. A single `node:fs` import pulls
 * the template back toward Node and quietly breaks the "bun first" promise, so it fails the
 * build instead of surviving in review. Allowances are explicit and explained, never silent.
 */

export type PlatformFinding = { rule: string; path: string; detail: string };

/** The runtime is Bun; these Node namespaces have a Bun equivalent for every use in this repo. */
const NODE_BUILTIN = /from\s+["']node:([a-z/]+)["']/;

/**
 * `node:path` is the one namespace Bun does not fully replace: `Bun.glob` covers discovery but
 * not `join`/`dirname`/`resolve`. Listed per-file so a new file cannot inherit the exemption.
 */
const PATH_ALLOWED = new Set([
  "apps/server/platform/database/migrate.ts",
  "apps/server/platform/observability/logger.ts",
  "apps/server/tests/helpers.ts",
  "apps/server/tests/migrations.test.ts",
  // Gate tools join paths; Bun has no path API, so node:path is the correct choice here.
  "tools/copy-guard.ts",
  // Vendored verbatim from the governance repo, with only import extensions and null-checks
  // touched. Rewriting them to Bun APIs would make future diffs against upstream unreadable.
  "tools/governance",
  "tools/design-gate.ts",
  "tools/interactive-surface.ts",
  "tools/shadcn-guard.ts",
  "tools/ui-completeness.ts",
  "apps/web/vite.config.ts",
  "erp.ts",
  "tools/scope.ts",
  "tools/skills.ts",
  "tools/slop.ts",
  "tools/tasks.ts",
]);

const SCAN_GLOBS = ["apps/**/*.ts", "apps/**/*.tsx", "tools/**/*.ts", "*.ts"];
const SKIP = [/node_modules\//, /\.d\.ts$/, /dist\//];

export async function checkPlatform(root: string): Promise<PlatformFinding[]> {
  const findings: PlatformFinding[] = [];
  const seen = new Set<string>();

  for (const pattern of SCAN_GLOBS) {
    for await (const file of new Glob(pattern).scan({ cwd: root })) {
      if (SKIP.some((re) => re.test(file)) || seen.has(file)) continue;
      seen.add(file);
      if (file.startsWith("apps/web/")) continue; // Vite/React build tooling runs under Node.
      // Vendored governance validators: copied verbatim, so their Node imports are upstream's
      // choice, not a decision made here. Rewriting them would make diffs against the source
      // unreadable, and the exemption is directory-scoped on purpose.
      if (file.startsWith("tools/governance/")) continue;

      const body = await Bun.file(`${root}/${file}`).text();
      for (const [index, line] of body.split("\n").entries()) {
        const match = NODE_BUILTIN.exec(line);
        if (!match) continue;
        const namespace = match[1] ?? "";
        if (namespace === "path" && PATH_ALLOWED.has(file)) continue;
        findings.push({
          rule: "NODE_BUILTIN",
          path: `${file}:${index + 1}`,
          detail: `uses node:${namespace} — use the Bun equivalent (Bun.file, Bun.write, Bun.Glob, Bun.spawn, Bun.$) or document an exemption in tools/platform.ts`,
        });
      }
    }
  }

  return findings;
}
