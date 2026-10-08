import { expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { allPermissions } from "../../../features/rbac/statements.ts";

/**
 * Guard: a permission that exists in the catalogue but is checked nowhere is a lie in the role
 * editor (it looks grantable and does nothing). Every key needs an enforcement site in server code.
 *
 * Enforcement site = either a literal key passed to `authorize`, `requirePermission` or checked
 * with `permissions.includes`, or an `ACTION_PERMISSION` entry whose `ACTION_PERMISSION.<name>`
 * is used by an `authorize`/`requirePermission` call in the same feature directory.
 */
const SERVER_ROOT = resolve(import.meta.dir, "../../..");

async function sourceFiles(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for await (const path of new Bun.Glob("**/*.ts").scan({ cwd: SERVER_ROOT, absolute: true })) {
    if (path.includes("/node_modules/") || path.includes("/tests/") || path.endsWith("/statements.ts")) continue;
    files.set(path, await Bun.file(path).text());
  }
  return files;
}

function enforcedKeys(files: Map<string, string>): Set<string> {
  const keys = new Set<string>();
  const literalCheck =
    /(?:authorize\(\s*\w+\s*,|requirePermission\(\s*\w+\s*,\s*\w+\s*,|permissions\.includes\()\s*"([a-z._]+)"/g;
  const usedByDirectory = new Map<string, Set<string>>();

  for (const [path, text] of files) {
    for (const match of text.matchAll(literalCheck)) keys.add(match[1] as string);
    const used = usedByDirectory.get(dirname(path)) ?? new Set<string>();
    for (const match of text.matchAll(/(?:authorize|requirePermission)\([^)]*ACTION_PERMISSION\.(\w+)/g)) {
      used.add(match[1] as string);
    }
    usedByDirectory.set(dirname(path), used);
  }

  for (const [path, text] of files) {
    const block = /ACTION_PERMISSION\s*=\s*\{([^}]*)\}/.exec(text)?.[1];
    if (!block) continue;
    const used = usedByDirectory.get(dirname(path)) ?? new Set<string>();
    for (const entry of block.matchAll(/(\w+):\s*"([a-z._]+)"/g)) {
      if (used.has(entry[1] as string)) keys.add(entry[2] as string);
    }
  }
  return keys;
}

test("every permission key has at least one enforcement site", async () => {
  const enforced = enforcedKeys(await sourceFiles());
  const orphans = allPermissions.filter((key) => !enforced.has(key));
  expect(orphans).toEqual([]);
});
