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
} from "../../../../tools/scaffolding.ts";

test("generator names normalize to safe lowercase paths", () => {
  expect(toKebabName("Sales Orders", "Feature")).toBe("sales-orders");
  expect(toKebabName("../etc/passwd", "Feature")).toBe("etc-passwd");
  expect(toSnakeName("Sales Orders")).toBe("sales_orders");
  expect(toSeederName("Users")).toBe("users");
  expect(toSeederName("users-seeder")).toBe("users");
  expect(toSeederName("audit_log_seeder")).toBe("audit-log");
});

test("migration generator continues a contiguous sequence and refuses gaps", () => {
  expect(nextMigrationFile(["0001_organizations.ts", "0002_departments.ts"], "Add Inventory")).toBe(
    "0003_add_inventory.ts",
  );
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
  expect(renderMigrationSource({ mode: "create", table: "posts" })).toContain("create table if not exists posts");
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
  expect(contents.has("apps/server/features/sales-orders/README.md")).toBe(true);
  expect(contents.has("apps/server/tests/features/sales-orders/sales-orders.test.ts")).toBe(true);

  const policy = contents.get("apps/server/features/sales-orders/policy.ts") ?? "";
  expect(policy).toContain('list: "sales-orders.read"');
  expect(policy).toContain("PermissionKey");

  const route = contents.get("apps/server/features/sales-orders/route.ts") ?? "";
  expect(route).toContain("export function salesOrdersRoutes(");
  expect(route).toContain('tag: "sales-orders"');
  expect(route).toContain("fallbackOrganizationId");

  const service = contents.get("apps/server/features/sales-orders/service.ts") ?? "";
  expect(service).toContain("export async function listSalesOrders(");
  expect(service).toContain('event: "sales-orders.created"');
  expect(service).toContain("organizationId, ...input");

  const schema = contents.get("apps/server/features/sales-orders/schema.ts") ?? "";
  expect(schema).toContain('"sales_orders"');
  expect(schema).toContain("organizations");
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
    '  department: ["id", "name", "code", "isActive", "organizationId"],',
    "} as const satisfies Record<string, readonly string[]>;",
  ].join("\n");
  const audited = addAuditEntity(auditFields, "sales-orders");
  expect(audited.status).toBe("added");
  expect(audited.source).toContain('"sales-orders": ["id", "organizationId", "createdAt", "updatedAt"]');
  expect(addAuditEntity(audited.source, "sales-orders").status).toBe("present");
  expect(addAuditEntity("export const AUDIT_FIELDS = {};", "sales-orders").status).toBe("skipped");

  const routes = [
    'import { auditRoutes } from "../features/audit/route.ts";',
    'import { rbacRoutes } from "../features/rbac/route.ts";',
    "",
    "export function registerRoutes() {",
    "  return (",
    "    app",
    `      .route(\`\${API_PREFIX}/rbac\`, rbacRoutes(ctx, organizationId))`,
    "  );",
    "}",
  ].join("\n");
  const mounted = addRouteMount(routes, { name: "sales-orders", camel: "salesOrders" });
  expect(mounted.status).toBe("added");
  expect(mounted.source).toContain('import { salesOrdersRoutes } from "../features/sales-orders/route.ts";');
  expect(mounted.source).toContain(`.route(\`\${API_PREFIX}/sales-orders\`, salesOrdersRoutes(ctx, organizationId))`);
  expect(addRouteMount(mounted.source, { name: "sales-orders", camel: "salesOrders" })).toEqual({
    source: mounted.source,
    status: "present",
  });
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
