import { fileIndex } from "../lib/file-index.ts";
import { directoryExists } from "./exists.ts";

/**
 * Package-target gate (docs/gates.md).
 *
 * A package that serves more than one runtime lays its source out under `src/<target>/`:
 * `ui` (browser and React), `server` (Bun, Hono, Postgres, Drizzle, Cloudflare), `capacitor`
 * (native plugins), or `utils` (runtime-neutral, shared by every side). `src/index.ts` (the
 * barrel) and `src/styles.css` stay at the root; every other source file belongs to a target
 * directory. A package with a single target stays flat, and a flat UI or server package may
 * keep `utils` helpers beside its dominant files.
 *
 * A flat package that is dominated by `utils` while carrying a concrete target, or that carries
 * two concrete targets, is really multi-target and must be split. Once a package has any target
 * directory, no file may stay outside its target.
 */

export type PackageTarget = "ui" | "server" | "capacitor" | "utils";

const TARGET_DIR = /^src\/(ui|server|capacitor|utils)\//;
const ROOT_EXEMPT = new Set(["src/index.ts", "src/styles.css"]);
const SERVER_SPECIFIER =
  /^(?:node:|bun(?::|\/|$)|hono(?:\/|$)|postgres(?:\/|$)|drizzle-orm(?:\/|$)|cloudflare(?::|\/|$)|@cloudflare\/)/;

function specifiersOf(code: string): string[] {
  const found = new Set<string>();
  for (const match of code.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

function isReactSpecifier(specifier: string): boolean {
  return /^react(?:-dom)?(?:\/|$)/.test(specifier);
}

/** The path wins; otherwise the imports decide, in the documented order. */
export function inferPackageTarget(file: string, code: string): PackageTarget {
  const dir = file.match(TARGET_DIR)?.[1];
  if (dir) return dir as PackageTarget;
  if (file.endsWith(".tsx")) return "ui";
  const specifiers = specifiersOf(code);
  if (specifiers.some(isReactSpecifier)) return "ui";
  if (specifiers.some((specifier) => specifier.startsWith("@capacitor/"))) return "capacitor";
  if (specifiers.some((specifier) => SERVER_SPECIFIER.test(specifier))) return "server";
  return "utils";
}

export async function checkPackageTargets(root: string): Promise<string[]> {
  const findings: string[] = [];
  const index = fileIndex(root);
  const manifests = [
    ...(await index.files("packages/*/package.json")),
    ...(await index.files("templates/packages/*/package.json")),
  ].sort();

  for (const manifest of manifests) {
    const packageDir = manifest.replace(/\/package\.json$/, "");
    if (!(await directoryExists(`${root}/${packageDir}/src`))) continue;

    const entries: Array<{ file: string; target: PackageTarget }> = [];
    for (const file of await index.files(`${packageDir}/src/**/*.{ts,tsx}`)) {
      if (file.endsWith(".d.ts")) continue;
      const relative = file.slice(packageDir.length + 1);
      if (ROOT_EXEMPT.has(relative)) continue;
      entries.push({ file: relative, target: inferPackageTarget(relative, await index.text(file)) });
    }
    if (entries.length === 0) continue;

    const flat = entries.filter((entry) => !TARGET_DIR.test(entry.file));
    const split = entries.some((entry) => TARGET_DIR.test(entry.file));
    if (split) {
      // A split package keeps every non-exempt source file under its own target directory.
      if (flat.length > 0) {
        findings.push(
          `${packageDir}: TARGET_LAYOUT — move ${flat.map((entry) => `${entry.file} (${entry.target})`).join(", ")} under src/<target>/`,
        );
      }
      continue;
    }

    const concrete = entries.filter((entry) => entry.target !== "utils");
    if (concrete.length === 0) continue;
    const concreteTargets = new Set(concrete.map((entry) => entry.target));
    const utilsCount = entries.length - concrete.length;
    if (concreteTargets.size > 1 || utilsCount > concrete.length) {
      findings.push(
        `${packageDir}: UNSPLIT_TARGETS — split ${concrete
          .map((entry) => `${entry.file} (${entry.target})`)
          .join(", ")} into src/<target>/`,
      );
    }
  }
  return findings;
}
