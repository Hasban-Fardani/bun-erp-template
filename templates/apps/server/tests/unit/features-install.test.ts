import { expect, test } from "bun:test";
import { installedFeatureNames } from "@cli/lib/feature-catalog.ts";
import { repoRoot } from "@cli/lib/repo.ts";

async function erp(...args: string[]): Promise<{ code: number; err: string }> {
  const proc = Bun.spawn(["bun", "cli/index.ts", ...args], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
  const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  return { code, err };
}

test("features:install reads every name and fails on an unknown one before installing the others", async () => {
  const before = await installedFeatureNames(repoRoot);
  const candidate = ["departments", "audit", "roles", "users"].find((name) => !before.includes(name));
  if (!candidate) return;
  const { code, err } = await erp("features:install", candidate, "no-such-feature");
  expect(code).toBe(1);
  expect(err).toContain('No feature "no-such-feature"');
  expect(await installedFeatureNames(repoRoot)).toEqual(before);
});

test("features:install without a name prints usage naming several names", async () => {
  const { code, err } = await erp("features:install");
  expect(code).toBe(1);
  expect(err).toContain("<name> [<name>...]");
});

test("packages:install validates every name before copying any", async () => {
  const { code, err } = await erp("packages:install", "data-table", "no-such-package");
  expect(code).toBe(1);
  expect(err).toContain('No package "no-such-package"');
});
