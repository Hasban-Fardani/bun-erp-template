import { expect, test } from "bun:test";
import { collectAbout, formatAbout } from "../../../../cli/lib/about.ts";
import { repoRoot } from "../../../../cli/lib/repo.ts";

test("about reports runtime versions, the installed catalog and every count", async () => {
  const about = await collectAbout(repoRoot);
  expect(about.bun.version).toBe(Bun.version);
  expect(about.bun.pinned).toBe("1.4.2");
  expect(about.typescriptVersion).toMatch(/^\d+\.\d+\.\d+$/);
  expect(about.apps.map((app) => app.name)).toEqual(expect.arrayContaining(["server", "web"]));
  expect(about.packages).toEqual(expect.arrayContaining(["i18n", "storage", "ui", "utils"]));
  expect(about.migrations).toBeGreaterThanOrEqual(7);
  expect(about.routes).toBeGreaterThanOrEqual(20);
  expect(about.gates).toBe(28);
  expect(typeof about.database.configured).toBe("boolean");
  expect(typeof about.database.reachable).toBe("boolean");
  expect(about.codegraph.indexed).toBe(true);
  expect(about.codegraph.files).toBeGreaterThanOrEqual(30);
});

test("formatAbout renders one readable screen with every section", async () => {
  const text = formatAbout(await collectAbout(repoRoot));
  for (const label of [
    "Bun",
    "TypeScript",
    "Apps",
    "Packages",
    "Features",
    "Migrations",
    "Routes",
    "Database",
    "Gates",
  ]) {
    expect(text).toContain(label);
  }
  expect(text).toContain("CodeGraph");
});
