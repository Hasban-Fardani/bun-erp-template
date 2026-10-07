import { expect, test } from "bun:test";
import { join } from "node:path";
import { planMakeFeature, writeMakeFeature } from "@cli/lib/make-feature.ts";
import { withCoreFiles } from "./support/make-feature-fixture.ts";

test("make:feature refuses before writing when a wiring anchor is missing", async () => {
  await withCoreFiles({ "apps/server/features/rbac/statements.ts": "export const statements = {};" }, async (root) => {
    await expect(planMakeFeature(root, "sales-orders")).rejects.toThrow(/statements\.ts/);
    // The refusal happens during planning: no feature, page, or migration file exists.
    expect(await Bun.file(join(root, "apps/server/features/sales-orders/schema.ts")).exists()).toBe(false);
    expect(await Bun.file(join(root, "apps/web/src/features/sales-orders/api/queries.ts")).exists()).toBe(false);
    expect(
      await Bun.file(join(root, "apps/server/database/migrations/0001_create_sales_orders_table.ts")).exists(),
    ).toBe(false);
  });
});

test("make:feature plans, then applies every file and wiring edit", async () => {
  await withCoreFiles({}, async (root) => {
    const plan = await planMakeFeature(root, "sales-orders");
    const touched = await writeMakeFeature(root, plan);

    expect(await Bun.file(join(root, "apps/server/features/sales-orders/schema.ts")).exists()).toBe(true);
    expect(await Bun.file(join(root, "apps/web/src/features/sales-orders/screens/sales-orders.tsx")).exists()).toBe(
      true,
    );
    expect(
      await Bun.file(join(root, "apps/server/database/migrations/0001_create_sales_orders_table.ts")).exists(),
    ).toBe(true);
    expect(touched).toContain("apps/server/features/sales-orders/service.ts");
    expect(touched).toContain("apps/server/features/rbac/statements.ts");

    const statements = await Bun.file(join(root, "apps/server/features/rbac/statements.ts")).text();
    expect(statements).toContain('"sales-orders": ["create", "read", "update", "delete"]');
    const routes = await Bun.file(join(root, "apps/server/routes/api.ts")).text();
    expect(routes).toContain('import { salesOrdersFeature } from "../features/sales-orders/feature.ts";');
    expect(routes).toContain("  salesOrdersFeature,");
    const nav = await Bun.file(join(root, "apps/web/src/config/navigation.ts")).text();
    expect(nav).toContain('url: "/sales-orders"');
    const en = await Bun.file(join(root, "packages/i18n/src/utils/messages/en-US.ts")).text();
    expect(en).toContain('"sales-orders.title": "Sales Orders"');
    const id = await Bun.file(join(root, "packages/i18n/src/utils/messages/id-ID.ts")).text();
    expect(id).toContain('"sales-orders.title": "Sales Orders"');
  });
});

test("make:feature refuses to overwrite an existing scaffold file", async () => {
  await withCoreFiles({}, async (root) => {
    await Bun.write(join(root, "apps/server/features/sales-orders/policy.ts"), "// existing");
    await expect(planMakeFeature(root, "sales-orders")).rejects.toThrow(/Refusing to overwrite/);
  });
});
