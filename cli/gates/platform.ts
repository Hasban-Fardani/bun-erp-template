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
 * `node:path` is the namespace Bun does not replace for joining: `Bun.glob` covers discovery but
 * not `join`/`dirname`/`resolve`. Listed per-file so a new file cannot inherit the exemption.
 */
const PATH_ALLOWED = new Set([
  "apps/server/database/migrate.ts",
  "apps/server/infra/observability/logger.ts",
  "apps/server/tests/support/fixtures.ts",
  "apps/server/tests/features/database/migrations.test.ts",
  // Server-owned CLI commands moved into the app catalog; they are still Bun tooling that joins paths.
  "apps/server/cli/commands/app.ts",
  "apps/server/cli/commands/db.ts",
  "apps/server/cli/commands/env.ts",
  "apps/server/cli/tasks/dev.ts",
  // Gate modules join paths; Bun has no path API, so node:path is the correct choice here.
  "cli/gates/copy-guard.ts",
  "cli/gates/architecture-guard.ts",
  "cli/gates/mobile-gate.ts",
  "cli/gates/versioning.ts",
  // Vendored verbatim from the governance repo, with only import extensions and null-checks
  // touched. Rewriting them to Bun APIs would make future diffs against upstream unreadable.
  "cli/gates/governance",
  "cli/gates/design-gate.ts",
  "cli/gates/interactive-surface.ts",
  "cli/gates/shadcn-guard.ts",
  "cli/gates/ui-completeness.ts",
  "apps/web/vite.config.ts",
  "cli/gates/scope.ts",
  "cli/gates/skills.ts",
  "cli/gates/slop.ts",
  "cli/gates/tasks.ts",
]);

/**
 * `cli/tasks` helpers run on the developer host, not in the app runtime: directory creation and
 * the home directory have no direct Bun replacement. Listed per file and namespace so a new file
 * cannot inherit the exemption.
 */
const NODE_ALLOWED: Readonly<Record<string, readonly string[]>> = {
  "cli/tasks/init-agents.ts": ["fs/promises", "os"],
};

const SCAN_GLOBS = [
  "apps/**/*.ts",
  "apps/**/*.tsx",
  "cli/gates/**/*.ts",
  "packages/**/*.ts",
  "packages/**/*.tsx",
  // Opt-in package sources wait in the catalog; they must stay as Bun-first as an installed copy.
  "templates/packages/**/*.ts",
  "templates/packages/**/*.tsx",
  // The mobile app waits in the catalog too; its source must stay Bun-first before it is installed.
  "templates/apps/**/*.ts",
  "templates/apps/**/*.tsx",
  // Feature catalog sources land in apps/* on install; they must stay Bun-first in the catalog.
  "templates/features/**/*.ts",
  "templates/features/**/*.tsx",
  "cli/**/*.ts",
  "*.ts",
];

/**
 * The CLI is Bun tooling that joins filesystem paths. Bun has no path API, so `node:path` is the
 * correct choice across the whole tree; the exemption is scoped to `cli/` on purpose.
 */
const PATH_ALLOWED_PREFIXES = ["cli/"];

const SKIP = [/node_modules\//, /\.d\.ts$/, /dist\//];

export async function checkPlatform(root: string): Promise<PlatformFinding[]> {
  const findings: PlatformFinding[] = [];
  const seen = new Set<string>();

  for (const pattern of SCAN_GLOBS) {
    for await (const file of new Glob(pattern).scan({ cwd: root })) {
      if (SKIP.some((re) => re.test(file)) || seen.has(file)) continue;
      seen.add(file);
      if (file.startsWith("apps/web/")) continue; // Vite/React build tooling runs under Node.
      // The web catalog copy carries the same Vite/React tooling while it waits to be installed.
      if (file.startsWith("templates/apps/web/")) continue;
      // Vendored governance validators: copied verbatim, so their Node imports are upstream's
      // choice, not a decision made here. Rewriting them would make diffs against the source
      // unreadable, and the exemption is directory-scoped on purpose.
      if (file.startsWith("cli/gates/governance/")) continue;

      const body = await Bun.file(`${root}/${file}`).text();
      // Catalog app copies keep their installed path for exemptions: templates/apps/<x> behaves like apps/<x>.
      const exemptFile = file.startsWith("templates/apps/") ? file.slice("templates/".length) : file;
      for (const [index, line] of body.split("\n").entries()) {
        const match = NODE_BUILTIN.exec(line);
        if (!match) continue;
        const namespace = match[1] ?? "";
        if (NODE_ALLOWED[exemptFile]?.includes(namespace)) continue;
        if (
          namespace === "path" &&
          (PATH_ALLOWED.has(exemptFile) || PATH_ALLOWED_PREFIXES.some((p) => exemptFile.startsWith(p)))
        )
          continue;
        findings.push({
          rule: "NODE_BUILTIN",
          path: `${file}:${index + 1}`,
          detail: `uses node:${namespace} — use the Bun equivalent (Bun.file, Bun.write, Bun.Glob, Bun.spawn, Bun.$) or document an exemption in cli/gates/platform.ts`,
        });
      }
    }
  }

  return findings;
}
