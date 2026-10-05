export function toKebabName(value: string, kind: string): string {
  const name = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) {
    throw new Error(`${kind} name must start with a letter and contain only letters, numbers, and dashes`);
  }
  return name;
}

export function toPascalName(value: string): string {
  return value
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
}

/** Laravel-style `make:seeder users` and `make:seeder users-seeder` must land on the same file. */
export function toSeederName(value: string): string {
  return toKebabName(value, "Seeder").replace(/-seeder$/, "") || "seeder";
}

/** SQL identifiers stay lowercase snake_case, independent from the kebab feature name. */
export function toSnakeName(value: string): string {
  const name = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error("Table name must start with a letter and contain only letters, numbers, and underscores");
  }
  return name;
}

export function nextMigrationFile(existingFiles: readonly string[], rawName: string): string {
  const name = toKebabName(rawName, "Migration").replaceAll("-", "_");
  const numbers = existingFiles
    .filter((file) => /^\d{4}_[a-z0-9_]+\.ts$/.test(file))
    .map((file) => Number(file.slice(0, 4)))
    .sort((a, b) => a - b);

  const hasGap = numbers.some((number, index) => number !== index + 1);
  if (hasGap) throw new Error("Existing migrations are not contiguous; run `bun erp check:gate migrations` first");

  const next = (numbers.at(-1) ?? 0) + 1;
  if (next > 9999) throw new Error("Migration sequence is full (maximum 9999)");
  const file = `${String(next).padStart(4, "0")}_${name}.ts`;
  if (existingFiles.includes(file)) throw new Error(`Migration already exists: ${file}`);
  return file;
}

export type MigrationIntent = { mode: "create" | "alter" | "stub"; table?: string; column?: string };

/** Reads Laravel's naming convention: create_x_table, add_y_to_x_table, alter_x_table. */
export function parseMigrationName(rawName: string): MigrationIntent {
  const name = toKebabName(rawName, "Migration").replaceAll("-", "_");
  const create = /^create_(.+)_table$/.exec(name);
  if (create?.[1]) return { mode: "create", table: create[1] };
  const add = /^add_(.+)_to_(.+)_table$/.exec(name);
  if (add?.[1] && add[2]) return { mode: "alter", column: add[1], table: add[2] };
  const alter = /^alter_(.+)_table$/.exec(name);
  if (alter?.[1]) return { mode: "alter", table: alter[1] };
  return { mode: "stub" };
}

export function renderMigrationSource(intent?: MigrationIntent): string {
  if (intent?.mode === "create" && intent.table) {
    return `import type { Database } from "../platform/database/index.ts";
import { runSqlMigration } from "../platform/database/sql-migration.ts";

/** Creates the ${intent.table} table. Add the feature's domain columns and indexes before applying. */
const statements = \`
create table if not exists ${intent.table} (
  id uuid primary key default uuidv7(),
  organization_id uuid not null references organizations (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
\`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
`;
  }
  if (intent?.mode === "alter" && intent.table) {
    return `import type { Database } from "../platform/database/index.ts";
import { runSqlMigration } from "../platform/database/sql-migration.ts";

/** Alters the ${intent.table} table. Adjust the column type, nullability, and default before applying. */
const statements = \`
alter table ${intent.table}
  add column ${intent.column ?? "new_column"} text not null default '';
\`;

export async function up(db: Database): Promise<void> {
  await runSqlMigration(db, statements);
}
`;
  }
  return `import type { Database } from "../platform/database/index.ts";

/** Add one forward-only, transactional schema change before applying this migration. */
export async function up(_database: Database): Promise<void> {
  throw new Error("Migration is not implemented; add the schema change before running db:migrate");
}
`;
}

export function renderSeederSource(name = "feature"): string {
  return `import type { Database } from "../platform/database/index.ts";

/** ${toPascalName(name)} seed data. Keep it deterministic and idempotent: db:seed may run this more than once. */
export async function seed(_database: Database): Promise<void> {
  throw new Error("Seeder is not implemented; insert the baseline rows before running db:seed");
}
`;
}

export type FeatureScaffold = {
  name: string;
  resource: string;
  table: string;
  pascal: string;
  camel: string;
  files: ReadonlyArray<{ path: string; contents: string }>;
};

export function renderFeatureScaffold(rawName: string): FeatureScaffold {
  const name = toKebabName(rawName, "Feature");
  const pascal = toPascalName(name);
  const camel = `${pascal[0]?.toLowerCase() ?? ""}${pascal.slice(1)}`;
  const table = toSnakeName(name);
  const files: Array<{ path: string; contents: string }> = [
    { path: `apps/server/features/${name}/README.md`, contents: renderFeatureReadme({ name, pascal }) },
    { path: `apps/server/features/${name}/policy.ts`, contents: renderFeaturePolicy(name) },
    { path: `apps/server/features/${name}/schema.ts`, contents: renderFeatureSchema({ table, camel }) },
    { path: `apps/server/features/${name}/validation.ts`, contents: renderFeatureValidation(pascal) },
    {
      path: `apps/server/features/${name}/service.ts`,
      contents: renderFeatureService({ resource: name, camel, pascal }),
    },
    { path: `apps/server/features/${name}/route.ts`, contents: renderFeatureRoutes({ name, camel, pascal }) },
    {
      path: `apps/server/tests/features/${name}/${name}.test.ts`,
      contents: renderFeatureTest(name),
    },
  ];
  return { name, resource: name, table, pascal, camel, files };
}

function renderFeatureReadme(input: { name: string; pascal: string }): string {
  const { name, pascal } = input;
  return [
    `# ${pascal} feature`,
    "",
    `This is the ownership boundary for the ${name} server feature. The generator wrote the base`,
    "files; add only what the product spec needs.",
    "",
    "## Generated files",
    "",
    "- validation.ts: create, update, and list input schemas (empty until the domain fields are added).",
    "- policy.ts: stable permission keys used by the routes.",
    "- schema.ts: Drizzle table with the organization and audit base columns.",
    "- service.ts: transactional CRUD with audit snapshots.",
    `- route.ts: thin Hono routes mounted under /api/v1/${name}.`,
    `- apps/server/tests/features/${name}/${name}.test.ts: HTTP round-trip tests.`,
    "",
    "## Next steps",
    "",
    "1. Add the domain columns to schema.ts and the matching fields to validation.ts.",
    "2. Align the generated migration with the schema, then run `bun erp db:migrate`.",
    `3. Run \`bun erp db:seed\` so the ${name}.* permissions reach the database.`,
    "4. Run `bun erp test` to check the generated round-trip test.",
    "5. Add web or mobile clients only when they need this feature.",
    "",
  ].join("\n");
}

function renderFeaturePolicy(resource: string): string {
  return `import type { PermissionKey } from "../rbac/statements.ts";

/** Maps module actions to permissions. Routes read from here — permissions are never hardcoded. */
export const ACTION_PERMISSION = {
  list: "${resource}.read",
  read: "${resource}.read",
  create: "${resource}.create",
  update: "${resource}.update",
  delete: "${resource}.delete",
} as const satisfies Record<string, PermissionKey>;
`;
}

function renderFeatureSchema(input: { table: string; camel: string }): string {
  const { table, camel } = input;
  return `import { sql } from "drizzle-orm";
import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "../../platform/database/schema.ts";

/**
 * ${camel} table. Add the feature's domain columns from the product spec, then align the
 * generated migration before running db:migrate.
 */
export const ${camel} = pgTable(
  "${table}",
  {
    id: uuid("id").primaryKey().default(sql\`uuidv7()\`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("${table}_organization_idx").on(table.organizationId)],
);
`;
}

function renderFeatureValidation(pascal: string): string {
  return `import * as z from "zod";
import { listQueryParts } from "../../http/list-query.ts";

/**
 * Input contract for ${pascal}. Replace the empty object schemas with the feature's fields:
 * the compiled exports feed the runtime and the parity test from the same definition.
 */
export const create${pascal}Schema = z.strictObject({});

export const update${pascal}Schema = z.strictObject({});

export const list${pascal}Schema = z.strictObject({
  ...listQueryParts({ sortable: ["createdAt"], defaultSort: "createdAt" }),
});

export const Create${pascal}Input = z.compile(create${pascal}Schema);
export const Update${pascal}Input = z.compile(update${pascal}Schema);
export const List${pascal}Input = z.compile(list${pascal}Schema);

export type Create${pascal}Input = z.output<typeof Create${pascal}Input>;
export type Update${pascal}Input = z.output<typeof Update${pascal}Input>;
export type List${pascal}Input = z.output<typeof List${pascal}Input>;
`;
}

function renderFeatureService(input: { resource: string; camel: string; pascal: string }): string {
  const { resource, camel, pascal } = input;
  return `import { and, eq, sql } from "drizzle-orm";
import { ApiError } from "../../http/errors.ts";
import { toOffset } from "../../http/list-query.ts";
import { orderByColumn } from "../../http/sort.ts";
import type { Database } from "../../platform/database/index.ts";
import { auditChange, snapshot } from "../audit/service.ts";
import { ${camel} } from "./schema.ts";
import type { Create${pascal}Input, List${pascal}Input, Update${pascal}Input } from "./validation.ts";

export type ${pascal} = typeof ${camel}.$inferSelect;

/**
 * Transaction boundary lives here. Organization comes from the server context, never from
 * client input; every write records an audit snapshot. Extend the queries with the domain
 * rules from the product spec.
 */
export async function list${pascal}(
  db: Database,
  organizationId: string,
  input: List${pascal}Input,
): Promise<{ items: ${pascal}[]; total: number }> {
  const where = eq(${camel}.organizationId, organizationId);
  const [items, count] = await Promise.all([
    db
      .select()
      .from(${camel})
      .where(where)
      .orderBy(...orderByColumn(${camel}, input.sort, input.dir))
      .limit(input.perPage)
      .offset(toOffset(input).offset),
    db.select({ total: sql<number>\`count(*)::int\` }).from(${camel}).where(where),
  ]);
  return { items, total: count[0]?.total ?? 0 };
}

export async function find${pascal}(
  db: Database,
  organizationId: string,
  id: string,
): Promise<${pascal} | undefined> {
  const rows = await db
    .select()
    .from(${camel})
    .where(and(eq(${camel}.organizationId, organizationId), eq(${camel}.id, id)))
    .limit(1);
  return rows[0];
}

export async function create${pascal}(
  db: Database,
  organizationId: string,
  input: Create${pascal}Input,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<${pascal}> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(${camel})
      .values({ organizationId, ...input })
      .returning();
    const after = rows[0] as ${pascal};
    await auditChange(tx as unknown as Database, {
      organizationId,
      actor,
      event: "${resource}.created",
      subject: { type: "${resource}", id: after.id },
      after: snapshot("${resource}", after as unknown as Record<string, unknown>),
    });
    return after;
  });
}

export async function update${pascal}(
  db: Database,
  organizationId: string,
  id: string,
  input: Update${pascal}Input,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<${pascal}> {
  return db.transaction(async (tx) => {
    const before = await find${pascal}(tx as unknown as Database, organizationId, id);
    if (!before) throw ApiError.notFound("${pascal} not found");

    const rows = await tx
      .update(${camel})
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(${camel}.organizationId, organizationId), eq(${camel}.id, id)))
      .returning();
    const after = rows[0] as ${pascal};

    await auditChange(tx as unknown as Database, {
      organizationId,
      actor,
      event: "${resource}.updated",
      subject: { type: "${resource}", id: after.id },
      before: snapshot("${resource}", before as unknown as Record<string, unknown>),
      after: snapshot("${resource}", after as unknown as Record<string, unknown>),
    });
    return after;
  });
}

export async function delete${pascal}(
  db: Database,
  organizationId: string,
  id: string,
  actor: { userId: string | null; traceId: string; label?: string },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const before = await find${pascal}(tx as unknown as Database, organizationId, id);
    if (!before) throw ApiError.notFound("${pascal} not found");

    await tx.delete(${camel}).where(and(eq(${camel}.organizationId, organizationId), eq(${camel}.id, id)));

    await auditChange(tx as unknown as Database, {
      organizationId,
      actor,
      event: "${resource}.deleted",
      subject: { type: "${resource}", id: id },
      before: snapshot("${resource}", before as unknown as Record<string, unknown>),
    });
    return { id };
  });
}
`;
}

function renderFeatureRoutes(input: { name: string; camel: string; pascal: string }): string {
  const { name, camel, pascal } = input;
  return `import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import { doc } from "../../http/api-docs.ts";
import { authorize } from "../../http/authorize.ts";
import { ApiError, ok } from "../../http/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/list-query.ts";
import type { AppVariables } from "../../http/types.ts";
import { validate } from "../../http/validate.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import { create${pascal}, delete${pascal}, find${pascal}, list${pascal}, update${pascal} } from "./service.ts";
import { Create${pascal}Input, List${pascal}Input, Update${pascal}Input } from "./validation.ts";

const ${camel}Ref = { type: "object", properties: { id: { type: "string" } } } as const;

const listData = {
  type: "object",
  properties: { items: { type: "array", items: ${camel}Ref }, ...listMetaSchemaProperties },
};

/** Thin route: validation → policy → service → envelope. Organization comes from the actor. */
export function ${camel}Routes(ctx: AppContext, fallbackOrganizationId: string) {
  return new Hono<{ Variables: AppVariables }>()
    .get(
      "/",
      authorize(ctx, ACTION_PERMISSION.list),
      doc({
        tag: "${name}",
        permission: ACTION_PERMISSION.list,
        summary: "List ${name}",
        query: List${pascal}Input,
        data: listData,
      }),
      validate("query", List${pascal}Input),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("query");
        const { items, total } = await list${pascal}(
          ctx.db,
          actor.organizationId ?? fallbackOrganizationId,
          input,
        );
        return ok(c, { items, ...listMeta(input, total) });
      },
    )
    .get(
      "/:id",
      authorize(ctx, ACTION_PERMISSION.read),
      doc({
        tag: "${name}",
        permission: ACTION_PERMISSION.read,
        summary: "Get one ${name}",
        data: ${camel}Ref,
      }),
      async (c) => {
        const actor = c.get("actor");
        const row = await find${pascal}(ctx.db, actor.organizationId ?? fallbackOrganizationId, c.req.param("id"));
        if (!row) throw ApiError.notFound("${pascal} not found");
        return ok(c, row);
      },
    )
    .post(
      "/",
      authorize(ctx, ACTION_PERMISSION.create),
      doc({
        tag: "${name}",
        permission: ACTION_PERMISSION.create,
        summary: "Create ${name}",
        body: Create${pascal}Input,
        data: ${camel}Ref,
      }),
      validate("json", Create${pascal}Input),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(c, await create${pascal}(ctx.db, actor.organizationId ?? fallbackOrganizationId, input, actor));
      },
    )
    .patch(
      "/:id",
      authorize(ctx, ACTION_PERMISSION.update),
      doc({
        tag: "${name}",
        permission: ACTION_PERMISSION.update,
        summary: "Update ${name}",
        body: Update${pascal}Input,
        data: ${camel}Ref,
      }),
      validate("json", Update${pascal}Input),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(
          c,
          await update${pascal}(ctx.db, actor.organizationId ?? fallbackOrganizationId, c.req.param("id"), input, actor),
        );
      },
    )
    .delete(
      "/:id",
      authorize(ctx, ACTION_PERMISSION.delete),
      doc({
        tag: "${name}",
        permission: ACTION_PERMISSION.delete,
        summary: "Delete ${name}",
        data: ${camel}Ref,
      }),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await delete${pascal}(ctx.db, actor.organizationId ?? fallbackOrganizationId, c.req.param("id"), actor));
      },
    );
}
`;
}

function renderFeatureTest(name: string): string {
  return `import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

const json = (body: unknown, method = "POST"): RequestInit => api.json(body, method);

// slop-ok: the HTTP fixture lifecycle is deliberately identical across feature tests
beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
}, 30_000);

afterAll(async () => {
  await api?.close();
});

describe("${name}", () => {
  test("anonymous caller is rejected before any business logic runs", async () => {
    const res = await api.app.request("/api/v1/${name}", { method: "GET" });
    expect(res.status).toBe(401);
  });

  test("create, list, update, and delete round-trip", async () => {
    const created = await api.app.request("/api/v1/${name}", json({}));
    expect(created.status).toBe(200);
    const body = (await created.json()) as { data: { id: string } };

    const listed = await api.app.request("/api/v1/${name}?perPage=10", { headers: { cookie: api.cookie } });
    expect(((await listed.json()) as { data: { total: number } }).data.total).toBe(1);

    const patched = await api.app.request(\`/api/v1/${name}/\${body.data.id}\`, json({}, "PATCH"));
    expect(patched.status).toBe(200);

    const removed = await api.app.request(\`/api/v1/${name}/\${body.data.id}\`, {
      method: "DELETE",
      headers: { cookie: api.cookie },
    });
    expect(removed.status).toBe(200);
  });

  test("missing id is 404, not 403", async () => {
    const res = await api.app.request("/api/v1/${name}/0199aaaa-0000-7000-8000-000000000000", {
      headers: { cookie: api.cookie },
    });
    expect(res.status).toBe(404);
  });
});
`;
}

export type WiringResult = { source: string; status: "added" | "present" | "skipped" };

/** Registers the generated entity's snapshot allowlist so audit writes cannot silently drop fields. */
export function addAuditEntity(source: string, resource: string): WiringResult {
  const escaped = resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^\\s{2}"?${escaped}"?:\\s`, "m").test(source)) return { source, status: "present" };
  const anchor = "} as const satisfies Record<string, readonly string[]>;";
  if (!source.includes(anchor)) return { source, status: "skipped" };
  const line = `  "${resource}": ["id", "organizationId", "createdAt", "updatedAt"],`;
  return { source: source.replace(anchor, `${line}\n${anchor}`), status: "added" };
}

/** Registers `<resource>: ["create", "read", "update", "delete"]` in the permission statements. */
export function addStatementResource(source: string, resource: string): WiringResult {
  const escaped = resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^\\s{2}"?${escaped}"?:\\s`, "m").test(source)) return { source, status: "present" };
  const anchor = `  audit: ["read"],`;
  if (!source.includes(anchor)) return { source, status: "skipped" };
  const line = `  "${resource}": ["create", "read", "update", "delete"],`;
  return { source: source.replace(anchor, `${line}\n${anchor}`), status: "added" };
}

/** Imports the generated router and mounts it under /api/v1/<name> in http/routes.ts. */
export function addRouteMount(source: string, input: { name: string; camel: string }): WiringResult {
  const { name, camel } = input;
  const importLine = `import { ${camel}Routes } from "../features/${name}/route.ts";`;
  const routeFragment = `.route(\`\${API_PREFIX}/${name}\`, ${camel}Routes(`;
  if (source.includes(importLine) && source.includes(routeFragment)) return { source, status: "present" };

  let next = source;
  if (!next.includes(importLine)) {
    const lines = next.split("\n");
    const featureImports = lines
      .map((line, index) => ({ index, path: /^import .+ from "([^"]+)";$/.exec(line)?.[1] }))
      .filter((entry): entry is { index: number; path: string } => Boolean(entry.path?.startsWith("../features/")));
    if (featureImports.length === 0) return { source, status: "skipped" };
    let insertAfter = (featureImports[0]?.index ?? 0) - 1;
    const target = `../features/${name}/route.ts`;
    for (const entry of featureImports) if (entry.path < target) insertAfter = entry.index;
    lines.splice(insertAfter + 1, 0, importLine);
    next = lines.join("\n");
  }

  if (!next.includes(routeFragment)) {
    const lines = next.split("\n");
    let lastRoute = -1;
    lines.forEach((line, index) => {
      if (/^\s*\.route\(/.test(line)) lastRoute = index;
    });
    if (lastRoute === -1) return { source, status: "skipped" };
    const indent = /^(\s*)/.exec(lines[lastRoute] ?? "")?.[1] ?? "      ";
    lines.splice(lastRoute + 1, 0, `${indent}.route(\`\${API_PREFIX}/${name}\`, ${camel}Routes(ctx, organizationId))`);
    next = lines.join("\n");
  }

  return { source: next, status: "added" };
}

/** "sales-orders" -> "Sales orders" for default, human-readable labels. */
export function humanizeName(value: string): string {
  const words = value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`);
  return words.join(" ") || "Feature";
}

export function renderWebFeatureScaffold(feature: { name: string; pascal: string; camel: string }): {
  files: ReadonlyArray<{ path: string; contents: string }>;
} {
  const { name, pascal, camel } = feature;
  const dir = `apps/web/src/features/${name}`;
  return {
    files: [
      { path: `${dir}/types/index.ts`, contents: renderWebTypes(name, pascal) },
      { path: `${dir}/api/queries.ts`, contents: renderWebQueries(name, camel) },
      { path: `${dir}/hooks/index.ts`, contents: renderWebHooks(pascal, camel) },
      { path: `${dir}/screens/${name}.tsx`, contents: renderWebScreen(name, pascal) },
      { path: `apps/web/src/pages/_authenticated/${name}.tsx`, contents: renderWebRoute(name, pascal) },
    ],
  };
}

function renderWebTypes(name: string, pascal: string): string {
  return `import type { InferResponseType } from "hono/client";
import type { rpc } from "../../../lib/rpc.ts";

/** One ${name} row as the list endpoint returns it. Add the domain fields once the spec defines them. */
type ListResponse = InferResponseType<(typeof rpc)[${JSON.stringify(name)}]["$get"], 200>;
export type ${pascal} = ListResponse["data"]["items"][number];
`;
}

function renderWebQueries(name: string, camel: string): string {
  const access = /^[A-Za-z_$][\w$]*$/.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`;
  return `import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import * as z from "zod";
import { listParams } from "../../../lib/list-params.ts";
import { call, rpc } from "../../../lib/rpc.ts";

export const ${camel}Keys = {
  list: (query: string) => ["${name}", query] as const,
};

export const ${camel}ListQuery = (query: string) =>
  queryOptions({
    queryKey: ${camel}Keys.list(query),
    queryFn: () =>
      call(rpc${access}.$get({ query: listParams(query, z.enum(["createdAt"]).default("createdAt")) })),
    placeholderData: keepPreviousData,
  });
`;
}

function renderWebHooks(pascal: string, camel: string): string {
  return `import { useQuery } from "@tanstack/react-query";
import { ${camel}ListQuery } from "../api/queries.ts";

export function use${pascal}List(query: string) {
  return useQuery(${camel}ListQuery(query));
}
`;
}

function renderWebScreen(name: string, pascal: string): string {
  return `import { useI18n } from "@bun-erp/i18n/react";
import { Card } from "@bun-erp/ui/atoms/card.tsx";
import { EmptyState } from "@bun-erp/ui/molecules/empty-state.tsx";
import { PageLoading } from "@bun-erp/ui/molecules/table-states.tsx";
import type { Column } from "@bun-erp/ui/organisms/data-table.tsx";
import { ResourceTable } from "@bun-erp/ui/organisms/resource-table.tsx";
import { PageShell } from "@bun-erp/ui/templates/page-shell.tsx";
import { useResourceTableLabels } from "../../../lib/resource-table-labels.ts";
import { useTableState } from "../../../lib/use-table-state.ts";
import { useSession } from "../../identity/hooks/index.ts";
import { use${pascal}List } from "../hooks/index.ts";
import type { ${pascal} } from "../types/index.ts";

// slop-ok: generated list screens deliberately share the standard resource-table shape
export function ${pascal}Screen() {
  const { t, formatRelativeTime } = useI18n();
  const labels = useResourceTableLabels();
  const session = useSession();
  const table = useTableState({ defaultSort: "createdAt", defaultDir: "desc" });
  const rows = use${pascal}List(table.queryString);

  if (session.isPending) return <PageLoading label={t("common.loading")} />;
  if (!session.data?.authenticated) return null;

  const columns: Column<${pascal}>[] = [
    {
      key: "id",
      header: t("${name}.column.id"),
      cell: (row) => <span className="font-mono text-[12.5px]">{row.id.slice(0, 8)}</span>,
    },
    {
      key: "createdAt",
      header: t("${name}.column.created"),
      sortable: true,
      align: "right",
      cell: (row) => <time className="text-[12px] text-ink-muted">{formatRelativeTime(row.createdAt)}</time>,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <PageShell title={t("${name}.title")}>
        <Card>
          {session.data.permissions.includes("${name}.read") ? (
            <ResourceTable
              caption={t("${name}.caption")}
              columns={columns}
              rowKey={(row) => row.id}
              result={rows.data}
              state={table}
              pending={rows.isFetching}
              error={rows.isError ? (rows.error as Error).message : undefined}
              searchPlaceholder={t("${name}.search")}
              empty={{ filtered: false, message: t("${name}.empty"), noMatchMessage: t("${name}.noMatch") }}
              labels={labels}
            />
          ) : (
            <EmptyState message={t("${name}.permissionDenied")} />
          )}
        </Card>
      </PageShell>
    </div>
  );
}
`;
}

function renderWebRoute(name: string, pascal: string): string {
  return `import { createFileRoute } from "@tanstack/react-router";
import { ${pascal}Screen } from "../../features/${name}/screens/${name}.tsx";

export const Route = createFileRoute("/_authenticated/${name}")({ component: ${pascal}Screen });
`;
}

/** Adds the sidebar entry (and its icon import) for the generated web screen. */
export function addNavItem(source: string, feature: { name: string }): WiringResult {
  const { name } = feature;
  const titleKey = `navigation.${name}`;
  if (source.includes(`"${titleKey}"`)) return { source, status: "present" };
  const importAnchor = "import { type LucideIcon,";
  const itemsAnchor = "    items: [";
  if (!source.includes(importAnchor) || !source.includes(itemsAnchor)) return { source, status: "skipped" };

  let next = source;
  if (!/\bFileText\b/.test(next)) next = next.replace(importAnchor, "import { FileText, type LucideIcon,");
  const at = next.indexOf(itemsAnchor) + itemsAnchor.length;
  const line = `\n      { titleKey: "${titleKey}", url: "/${name}", icon: FileText, permission: "${name}.read" },`;
  next = `${next.slice(0, at)}${line}${next.slice(at)}`;
  return { source: next, status: "added" };
}

const I18N_ANCHORS = {
  "en-US": "} as const;",
  "id-ID": "} satisfies Record<keyof typeof enUS, string>;",
} as const;

/** Adds the screen's message keys to one catalog. Missing keys break the typed catalog at build time. */
export function addI18nKeys(source: string, feature: { name: string }, locale: "en-US" | "id-ID"): WiringResult {
  const { name } = feature;
  if (source.includes(`"${name}.title"`)) return { source, status: "present" };
  const label = humanizeName(name);
  const lower = label.toLowerCase();
  const keys =
    locale === "en-US"
      ? {
          [`navigation.${name}`]: label,
          [`${name}.title`]: label,
          [`${name}.caption`]: `${label} records`,
          [`${name}.search`]: `Search ${lower}…`,
          [`${name}.empty`]: `No ${lower} yet.`,
          [`${name}.noMatch`]: `No ${lower} match your search.`,
          [`${name}.permissionDenied`]: `You do not have permission to view ${lower}.`,
          [`${name}.column.id`]: "ID",
          [`${name}.column.created`]: "Created",
        }
      : {
          [`navigation.${name}`]: label,
          [`${name}.title`]: label,
          [`${name}.caption`]: `Data ${lower}`,
          [`${name}.search`]: `Cari ${lower}…`,
          [`${name}.empty`]: `Belum ada ${lower}.`,
          [`${name}.noMatch`]: `Tidak ada ${lower} yang cocok.`,
          [`${name}.permissionDenied`]: `Anda tidak punya izin melihat ${lower}.`,
          [`${name}.column.id`]: "ID",
          [`${name}.column.created`]: "Dibuat",
        };
  const anchor = I18N_ANCHORS[locale];
  const at = source.lastIndexOf(anchor);
  if (at === -1) return { source, status: "skipped" };
  const lines = Object.entries(keys)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n");
  return { source: `${source.slice(0, at)}${lines}\n${source.slice(at)}`, status: "added" };
}
