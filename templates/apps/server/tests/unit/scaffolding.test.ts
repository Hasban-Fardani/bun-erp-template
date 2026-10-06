import { expect, test } from "bun:test";
import {
  addAuditEntity,
  addI18nKeys,
  addNavItem,
  addRouteMount,
  addStatementResource,
  humanizeName,
  nextMigrationFile,
  parseMigrationName,
  renderFeatureScaffold,
  renderMigrationSource,
  renderSeederSource,
  renderWebFeatureScaffold,
  toKebabName,
  toSeederName,
  toSnakeName,
} from "../../../../cli/lib/scaffolding.ts";

test("generator names normalize to safe lowercase paths", () => {
  expect(toKebabName("Sales Orders", "Feature")).toBe("sales-orders");
  expect(toKebabName("../etc/passwd", "Feature")).toBe("etc-passwd");
  expect(toSnakeName("Sales Orders")).toBe("sales_orders");
  expect(toSeederName("Users")).toBe("users");
  expect(toSeederName("users-seeder")).toBe("users");
  expect(toSeederName("audit_log_seeder")).toBe("audit-log");
});

test("migration generator continues a contiguous sequence and refuses gaps", () => {
  expect(nextMigrationFile(["0001_bootstrap.ts", "0002_posts.ts"], "Add Inventory")).toBe("0003_add_inventory.ts");
  expect(() => nextMigrationFile(["0001_first.ts", "0003_third.ts"], "fourth")).toThrow(/not contiguous/);
});

test("migration names follow Laravel conventions before falling back to a stub", () => {
  expect(parseMigrationName("create_posts_table")).toEqual({ mode: "create", table: "posts" });
  expect(parseMigrationName("add_status_to_posts_table")).toEqual({
    mode: "alter",
    table: "posts",
    column: "status",
  });
  expect(parseMigrationName("alter_posts_table")).toEqual({ mode: "alter", table: "posts" });
  expect(parseMigrationName("create inventory")).toEqual({ mode: "stub" });
});

test("scaffold output follows the feature, migration, and seeder contracts", () => {
  expect(renderMigrationSource()).toContain("export async function up(_database: Database)");
  expect(renderMigrationSource()).toContain("before running db:migrate");
  const createSql = renderMigrationSource({ mode: "create", table: "posts" });
  expect(createSql).toContain("create table if not exists posts");
  expect(createSql).toContain("deleted_at timestamptz");
  expect(createSql).toContain("version integer not null default 0");
  expect(createSql).not.toContain("number text not null");
  expect(renderMigrationSource({ mode: "create", table: "posts", numbering: true })).toContain("number text not null");
  expect(renderMigrationSource({ mode: "alter", table: "posts", column: "status" })).toContain(
    "add column status text not null default ''",
  );
  expect(renderSeederSource("users")).toContain("export async function seed(_database: Database)");
  expect(renderSeederSource("users")).toContain("idempotent");
});

test("make:feature emits a full CRUD feature, policy, and test", () => {
  const scaffold = renderFeatureScaffold("Sales Orders");
  expect(scaffold.name).toBe("sales-orders");
  expect(scaffold.resource).toBe("sales-orders");
  expect(scaffold.table).toBe("sales_orders");
  expect(scaffold.camel).toBe("salesOrders");
  expect(scaffold.pascal).toBe("SalesOrders");

  const contents = new Map(scaffold.files.map((file) => [file.path, file.contents]));
  // The hand-written features have no README, so the generator must not create one.
  expect(contents.has("apps/server/features/sales-orders/README.md")).toBe(false);
  expect([...contents.keys()]).toEqual([
    "apps/server/features/sales-orders/policy.ts",
    "apps/server/features/sales-orders/schema.ts",
    "apps/server/features/sales-orders/validation.ts",
    "apps/server/features/sales-orders/service.ts",
    "apps/server/features/sales-orders/route.ts",
    "apps/server/features/sales-orders/feature.ts",
    "apps/server/tests/features/sales-orders/sales-orders.test.ts",
  ]);

  const policy = contents.get("apps/server/features/sales-orders/policy.ts") ?? "";
  expect(policy).toContain('list: "sales-orders.read"');
  expect(policy).toContain("PermissionKey");

  const route = contents.get("apps/server/features/sales-orders/route.ts") ?? "";
  expect(route).toContain("export function salesOrdersRoutes(ctx: AppContext)");
  expect(route).toContain('tag: "sales-orders"');
  expect(route).not.toContain("organization");

  const feature = contents.get("apps/server/features/sales-orders/feature.ts") ?? "";
  expect(feature).toContain('import { defineFeature } from "../../http/helpers/feature.ts";');
  expect(feature).toContain("export const salesOrdersFeature = defineFeature({");
  expect(feature).toContain('name: "sales-orders"');
  expect(feature).toContain("routes: salesOrdersRoutes");

  const service = contents.get("apps/server/features/sales-orders/service.ts") ?? "";
  expect(service).toContain("export async function listSalesOrders(");
  expect(service).toContain('"sales-orders.created"');
  expect(service).toContain("notDeleted(salesOrders)");
  expect(service).toContain("async function requireSalesOrders(");
  expect(service).toContain("bumpVersion(salesOrders)");
  expect(service).toContain("versionGuard(salesOrders, id, expectedVersion)");
  expect(service).toContain("ApiError.versionConflict");
  expect(service).toContain("softDeleteRow(tx as unknown as Database, salesOrders, id)");
  expect(service).toContain("export async function restoreSalesOrders(");
  expect(service).toContain("export async function forceDeleteSalesOrders(");
  expect(service).not.toContain("nextNumber");

  const schema = contents.get("apps/server/features/sales-orders/schema.ts") ?? "";
  expect(schema).toContain('"sales_orders"');
  expect(schema).not.toContain("organizations");
  expect(schema).toContain("deletedAt: softDelete()");
  expect(schema).toContain("version: version()");
  expect(schema).toContain('from "../../database/soft-delete.ts"');
  expect(schema).toContain('from "../../database/optimistic-locking.ts"');

  const validation = contents.get("apps/server/features/sales-orders/validation.ts") ?? "";
  expect(validation).toContain("expectedVersion: z.number().int().min(0)");
  expect(validation).toContain("includeDeleted: z.stringbool()");

  const generatedRoute = contents.get("apps/server/features/sales-orders/route.ts") ?? "";
  expect(generatedRoute).toContain('"/:id/restore"');
  expect(generatedRoute).toContain('"/:id/force"');
});

test("make:feature can allocate a numbering sequence on create", () => {
  const numbered = renderFeatureScaffold("Sales Orders", {
    sequence: { key: "sales-order", prefix: "SO-", padding: 4 },
  });
  const contents = new Map(numbered.files.map((file) => [file.path, file.contents]));
  const schema = contents.get("apps/server/features/sales-orders/schema.ts") ?? "";
  expect(schema).toContain('number: text("number").notNull()');

  const service = contents.get("apps/server/features/sales-orders/service.ts") ?? "";
  expect(service).toContain('await nextNumber(tx, "sales-order", { prefix: "SO-", padding: 4 })');
  expect(service).toContain('from "../../database/numbering.ts"');

  const plain = renderFeatureScaffold("Sales Orders");
  const plainService = plain.files.find((file) => file.path.endsWith("service.ts"))?.contents ?? "";
  expect(plainService).not.toContain("nextNumber");
});

test("make:feature wires permissions and routes without touching duplicates", () => {
  const statements = `export const statements = {\n  user: ["create"],\n  audit: ["read"],\n} as const;`;
  const wired = addStatementResource(statements, "sales-orders");
  expect(wired.status).toBe("added");
  expect(wired.source).toContain('"sales-orders": ["create", "read", "update", "delete"]');
  expect(wired.source.indexOf('"sales-orders"')).toBeLessThan(wired.source.indexOf('audit: ["read"]'));
  expect(addStatementResource(wired.source, "sales-orders")).toEqual({
    source: wired.source,
    status: "present",
  });
  expect(addStatementResource("export const statements = {};", "sales-orders").status).toBe("skipped");

  const auditFields = [
    "export const AUDIT_FIELDS = {",
    '  role: ["id", "key", "name", "isSystem"],',
    "} as const satisfies Record<string, readonly string[]>;",
  ].join("\n");
  const audited = addAuditEntity(auditFields, "sales-orders");
  expect(audited.status).toBe("added");
  expect(audited.source).toContain('"sales-orders": ["id", "createdAt", "updatedAt"]');
  expect(addAuditEntity(audited.source, "sales-orders").status).toBe("present");
  expect(addAuditEntity("export const AUDIT_FIELDS = {};", "sales-orders").status).toBe("skipped");

  const routes = [
    'import { auditFeature } from "../features/audit/feature.ts";',
    'import { rbacFeature } from "../features/rbac/feature.ts";',
    "",
    "const FEATURES = [",
    "  rbacFeature,",
    "] as const satisfies readonly FeatureDefinition[];",
    "",
    "export function registerRoutes() {",
    "  return registerFeatures(app, ctx, FEATURES);",
    "}",
  ].join("\n");
  const mounted = addRouteMount(routes, { name: "sales-orders", camel: "salesOrders" });
  expect(mounted.status).toBe("added");
  expect(mounted.source).toContain('import { salesOrdersFeature } from "../features/sales-orders/feature.ts";');
  expect(mounted.source).toContain("  salesOrdersFeature,\n] as const satisfies readonly FeatureDefinition[];");
  expect(addRouteMount(mounted.source, { name: "sales-orders", camel: "salesOrders" })).toEqual({
    source: mounted.source,
    status: "present",
  });
  expect(addRouteMount("export const x = 1;", { name: "sales-orders", camel: "salesOrders" }).status).toBe("skipped");
});

test("make:feature emits the web feature files that mirror the app patterns", () => {
  expect(humanizeName("sales-orders")).toBe("Sales Orders");
  const web = renderWebFeatureScaffold({ name: "sales-orders", pascal: "SalesOrders", camel: "salesOrders" });
  const contents = new Map(web.files.map((file) => [file.path, file.contents]));
  expect([...contents.keys()]).toEqual([
    "apps/web/src/features/sales-orders/types/index.ts",
    "apps/web/src/features/sales-orders/api/queries.ts",
    "apps/web/src/features/sales-orders/hooks/index.ts",
    "apps/web/src/features/sales-orders/screens/sales-orders.tsx",
    "apps/web/src/pages/_authenticated/sales-orders.tsx",
  ]);

  const screen = contents.get("apps/web/src/features/sales-orders/screens/sales-orders.tsx") ?? "";
  expect(screen).toContain("export function SalesOrdersScreen()");
  expect(screen).toContain('t("sales-orders.title")');
  expect(screen).toContain("useSalesOrdersList(table.queryString)");

  const queries = contents.get("apps/web/src/features/sales-orders/api/queries.ts") ?? "";
  expect(queries).toContain("export const salesOrdersListQuery =");
  expect(queries).toContain('rpc["sales-orders"].$get');

  const types = contents.get("apps/web/src/features/sales-orders/types/index.ts") ?? "";
  expect(types).toContain('(typeof rpc)["sales-orders"]["$get"]');

  const route = contents.get("apps/web/src/pages/_authenticated/sales-orders.tsx") ?? "";
  expect(route).toContain('createFileRoute("/_authenticated/sales-orders")');
});

test("web wiring adds the sidebar entry and both locale catalogs once", () => {
  const nav = [
    'import { type LucideIcon, ScrollText, ShieldCheck, Users } from "lucide-react";',
    "",
    "export const navGroups = [",
    "  {",
    '    items: [{ titleKey: "navigation.users", url: "/users", icon: Users, permission: "user.read" }],',
    "  },",
    "];",
  ].join("\n");
  const wiredNav = addNavItem(nav, { name: "sales-orders" });
  expect(wiredNav.status).toBe("added");
  expect(wiredNav.source).toContain("import { FileText, type LucideIcon,");
  expect(wiredNav.source).toContain('url: "/sales-orders"');
  expect(wiredNav.source).toContain('permission: "sales-orders.read"');
  expect(addNavItem(wiredNav.source, { name: "sales-orders" }).status).toBe("present");
  expect(addNavItem("export const x = 1;", { name: "sales-orders" }).status).toBe("skipped");

  // Regression: the real navigation import starts with another icon (Bell), not `type LucideIcon`.
  const bellNav = [
    'import { Bell, type LucideIcon, Users } from "lucide-react";',
    "export const navGroups = [",
    "  {",
    "    items: [],",
    "  },",
    "];",
  ].join("\n");
  const wiredBell = addNavItem(bellNav, { name: "reports" });
  expect(wiredBell.status).toBe("added");
  expect(wiredBell.source).toContain('import { FileText, Bell, type LucideIcon, Users } from "lucide-react";');

  const en = 'export const enUS = {\n  "a": "A",\n} as const;';
  const addedEn = addI18nKeys(en, { name: "sales-orders" }, "en-US");
  expect(addedEn.status).toBe("added");
  expect(addedEn.source).toContain('"sales-orders.title": "Sales Orders"');
  expect(addedEn.source).toContain('"navigation.sales-orders": "Sales Orders"');
  expect(addI18nKeys(addedEn.source, { name: "sales-orders" }, "en-US").status).toBe("present");

  const id = 'export const idID = {\n  "a": "A",\n} satisfies Record<keyof typeof enUS, string>;';
  expect(addI18nKeys(id, { name: "sales-orders" }, "id-ID").source).toContain('"sales-orders.title": "Sales Orders"');
  expect(addI18nKeys("const x = 1;", { name: "sales-orders" }, "en-US").status).toBe("skipped");
});
