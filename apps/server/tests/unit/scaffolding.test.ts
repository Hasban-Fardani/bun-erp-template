import { expect, test } from "bun:test";
import {
  addAuditEntity,
  addRouteMount,
  addStatementResource,
  nextMigrationFile,
  parseMigrationName,
  renderFeatureScaffold,
  renderMigrationSource,
  renderSeederSource,
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
