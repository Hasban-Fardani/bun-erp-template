import { expect, test } from "bun:test";
import {
  nextMigrationFile,
  renderFeatureGuide,
  renderMigrationSource,
  renderSeederSource,
  toKebabName,
} from "../../../../tools/scaffolding.ts";

test("generator names normalize to safe lowercase paths", () => {
  expect(toKebabName("Sales Orders", "Feature")).toBe("sales-orders");
  expect(toKebabName("../etc/passwd", "Feature")).toBe("etc-passwd");
});

test("migration generator continues a contiguous sequence and refuses gaps", () => {
  expect(nextMigrationFile(["0001_organizations.ts", "0002_departments.ts"], "Add Inventory")).toBe(
    "0003_add_inventory.ts",
  );
  expect(() => nextMigrationFile(["0001_first.ts", "0003_third.ts"], "fourth")).toThrow(/not contiguous/);
});

test("scaffold output follows the feature, migration, and seeder contracts", () => {
  expect(renderFeatureGuide("sales-orders")).toContain("/api/v1/sales-orders");
  expect(renderMigrationSource()).toContain("export async function up(_database: Database)");
  expect(renderMigrationSource()).toContain("before running db:migrate");
  expect(renderSeederSource()).toContain("export async function seed(database: Database)");
});
