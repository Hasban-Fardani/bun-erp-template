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

export type MigrationIntent = {
  mode: "create" | "alter" | "stub";
  table?: string;
  column?: string;
  /** Create-mode only: add the sequence-backed `number` column. */
  numbering?: boolean;
  /** Create-mode only: add the opt-in `deleted_at` column (default off). */
  softDelete?: boolean;
  /** Create-mode only: add the `version` column (default on; false = no optimistic locking). */
  version?: boolean;
};

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
    const numberColumn = intent.numbering ? "\n  number text not null," : "";
    const deletedAtColumn = intent.softDelete ? "\n  deleted_at timestamptz," : "";
    const versionColumn = intent.version === false ? "" : "\n  version integer not null default 0,";
    return `import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

/** Creates the ${intent.table} table. Add the feature's domain columns and indexes before applying. */
const statements = \`
create table if not exists ${intent.table} (
  id uuid primary key default uuidv7(),${numberColumn}${deletedAtColumn}${versionColumn}
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
    return `import type { Database } from "../index.ts";
import { runSqlMigration } from "../sql-migration.ts";

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
  return `import type { Database } from "../index.ts";

/** Add one forward-only, transactional schema change before applying this migration. */
export async function up(_database: Database): Promise<void> {
  throw new Error("Migration is not implemented; add the schema change before running db:migrate");
}
`;
}

export function renderSeederSource(name = "feature"): string {
  return `import type { Database } from "../index.ts";

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

export type FeatureScaffoldOptions = {
  /** When set, create allocates a formatted number through the row-locked `nextNumber` helper. */
  sequence?: { key: string; prefix?: string; padding?: number };
  /**
   * Opt-in: adds `deleted_at`, the `notDeleted` read filter and the restore/force-delete lifecycle.
   * Only master data that history references needs it; append-only and high-volume tables do not.
   */
  softDelete?: boolean;
  /** Optimistic locking is on by default; `false` emits a plain update with no `expectedVersion`. */
  version?: boolean;
};

export function renderFeatureScaffold(rawName: string, options: FeatureScaffoldOptions = {}): FeatureScaffold {
  const name = toKebabName(rawName, "Feature");
  const pascal = toPascalName(name);
  const camel = `${pascal[0]?.toLowerCase() ?? ""}${pascal.slice(1)}`;
  const table = toSnakeName(name);
  const softDelete = options.softDelete === true;
  const version = options.version !== false;
  const files: Array<{ path: string; contents: string }> = [
    { path: `apps/server/features/${name}/policy.ts`, contents: renderFeaturePolicy(name) },
    {
      path: `apps/server/features/${name}/schema.ts`,
      contents: renderFeatureSchema({ table, camel, sequenced: options.sequence !== undefined, softDelete, version }),
    },
    {
      path: `apps/server/features/${name}/validation.ts`,
      contents: renderFeatureValidation(pascal, { softDelete, version }),
    },
    {
      path: `apps/server/features/${name}/service.ts`,
      contents: renderFeatureService({
        resource: name,
        camel,
        pascal,
        sequence: options.sequence,
        softDelete,
        version,
      }),
    },
    {
      path: `apps/server/features/${name}/route.ts`,
      contents: renderFeatureRoutes({ name, camel, pascal, softDelete, version }),
    },
    { path: `apps/server/features/${name}/feature.ts`, contents: renderFeatureModule({ name, camel }) },
    {
      path: `apps/server/tests/features/${name}/${name}.test.ts`,
      contents: renderFeatureTest(name, { softDelete, version }),
    },
  ];
  return { name, resource: name, table, pascal, camel, files };
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

function renderFeatureSchema(input: {
  table: string;
  camel: string;
  sequenced: boolean;
  softDelete: boolean;
  version: boolean;
}): string {
  const { table, camel, sequenced, softDelete, version } = input;
  const numberColumn = sequenced ? '\n  number: text("number").notNull(),' : "";
  const pgImports = sequenced ? "pgTable, text, timestamp, uuid" : "pgTable, timestamp, uuid";
  const databaseImports = [
    ...(version ? ['import { version } from "../../database/optimistic-locking.ts";'] : []),
    ...(softDelete ? ['import { softDelete } from "../../database/soft-delete.ts";'] : []),
  ];
  const imports = [
    'import { sql } from "drizzle-orm";',
    `import { ${pgImports} } from "drizzle-orm/pg-core";`,
    ...databaseImports,
  ].join("\n");
  const deletedAtColumn = softDelete ? "\n  deletedAt: softDelete()," : "";
  const versionColumn = version ? "\n  version: version()," : "";
  return `${imports}

/**
 * ${camel} table. Add the feature's domain columns from the product spec, then align the
 * generated migration before running db:migrate.
 */
export const ${camel} = pgTable("${table}", {
  id: uuid("id").primaryKey().default(sql\`uuidv7()\`),${numberColumn}${deletedAtColumn}${versionColumn}
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
`;
}

function renderFeatureValidation(pascal: string, input: { softDelete: boolean; version: boolean }): string {
  const expectedVersion = input.version
    ? `
  // Optimistic locking: the caller sends the version it read; a stale value is a 409.
  expectedVersion: z.number().int().min(0),`
    : "";
  const includeDeleted = input.softDelete
    ? `
  includeDeleted: z.stringbool().default(false),`
    : "";
  return `import * as z from "zod";
import { listQueryParts } from "../../http/helpers/list-query.ts";

/**
 * Input contract for ${pascal}. Replace the empty object schemas with the feature's fields:
 * the compiled exports feed the runtime and the parity test from the same definition.
 */
export const create${pascal}Schema = z.strictObject({});

export const update${pascal}Schema = z.strictObject({${expectedVersion}
});

export const list${pascal}Schema = z.strictObject({
  ...listQueryParts({ sortable: ["createdAt"], defaultSort: "createdAt" }),${includeDeleted}
});

export const Create${pascal}Input = z.compile(create${pascal}Schema);
export const Update${pascal}Input = z.compile(update${pascal}Schema);
export const List${pascal}Input = z.compile(list${pascal}Schema);

export type Create${pascal}Input = z.output<typeof Create${pascal}Input>;
export type Update${pascal}Input = z.output<typeof Update${pascal}Input>;
export type List${pascal}Input = z.output<typeof List${pascal}Input>;
`;
}

function renderFeatureService(input: {
  resource: string;
  camel: string;
  pascal: string;
  sequence?: { key: string; prefix?: string; padding?: number };
  softDelete: boolean;
  version: boolean;
}): string {
  const { resource, camel, pascal, sequence, softDelete, version } = input;
  const createValues = sequence
    ? `{\n      ...input,\n      number: await nextNumber(tx, ${JSON.stringify(sequence.key)}, ${renderSequenceOptions(sequence)}),\n    }`
    : "{ ...input }";
  const databaseImports = [
    ...(sequence ? ['import { nextNumber } from "../../database/numbering.ts";'] : []),
    ...(version ? ['import { bumpVersion, versionGuard } from "../../database/optimistic-locking.ts";'] : []),
    ...(softDelete
      ? ['import { forceDeleteRow, notDeleted, restoreRow, softDeleteRow } from "../../database/soft-delete.ts";']
      : []),
  ].join("\n");
  const listWhere = softDelete ? `  const where = input.includeDeleted ? undefined : notDeleted(${camel});\n` : "";
  const listWhereClause = softDelete ? ".where(where)" : "";
  const findFunction = softDelete
    ? `export async function find${pascal}(
  db: Database,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<${pascal} | undefined> {
  const where = options.includeDeleted
    ? eq(${camel}.id, id)
    : and(eq(${camel}.id, id), notDeleted(${camel}));
  const rows = await db.select().from(${camel}).where(where).limit(1);
  return rows[0];
}`
    : `export async function find${pascal}(db: Database, id: string): Promise<${pascal} | undefined> {
  const rows = await db.select().from(${camel}).where(eq(${camel}.id, id)).limit(1);
  return rows[0];
}`;
  const requireFunction = softDelete
    ? `/** Loads the row (optionally including deleted) or 404s before any write. */
async function require${pascal}(
  db: Database,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<${pascal}> {
  const before = await find${pascal}(db, id, options);
  if (!before) throw ApiError.notFound("${pascal} not found");
  return before;
}`
    : `/** Loads the row or 404s before any write. */
async function require${pascal}(db: Database, id: string): Promise<${pascal}> {
  const before = await find${pascal}(db, id);
  if (!before) throw ApiError.notFound("${pascal} not found");
  return before;
}`;
  const findCurrent = softDelete
    ? `await find${pascal}(tx as unknown as Database, id, { includeDeleted: true })`
    : `await find${pascal}(tx as unknown as Database, id)`;
  const updateFunction = version
    ? `export async function update${pascal}(
  db: Database,
  id: string,
  input: Update${pascal}Input,
  actor: Actor,
): Promise<${pascal}> {
  return db.transaction(async (tx) => {
    const { expectedVersion, ...patch } = input;
    const before = await require${pascal}(tx as unknown as Database, id);

    // One statement: the data change and the version bump happen together, guarded by the version.
    const rows = await tx
      .update(${camel})
      .set({ ...patch, updatedAt: new Date(), version: bumpVersion(${camel}) })
      .where(versionGuard(${camel}, id, expectedVersion))
      .returning();
    const after = rows[0];
    if (!after) {
      const current = ${findCurrent};
      if (!current) throw ApiError.notFound("${pascal} not found");
      throw ApiError.versionConflict(current.version);
    }

    await record${pascal}Event(tx as unknown as Database, actor, "${resource}.updated", after.id, before, after);
    return after;
  });
}`
    : `export async function update${pascal}(
  db: Database,
  id: string,
  input: Update${pascal}Input,
  actor: Actor,
): Promise<${pascal}> {
  return db.transaction(async (tx) => {
    const before = await require${pascal}(tx as unknown as Database, id);

    const rows = await tx
      .update(${camel})
      .set({ ...input, updatedAt: new Date() })
      .where(eq(${camel}.id, id))
      .returning();
    const after = rows[0];
    if (!after) throw ApiError.notFound("${pascal} not found");

    await record${pascal}Event(tx as unknown as Database, actor, "${resource}.updated", after.id, before, after);
    return after;
  });
}`;
  const deleteFunction = softDelete
    ? `export async function delete${pascal}(
  db: Database,
  id: string,
  actor: Actor,
): Promise<${pascal}> {
  return db.transaction(async (tx) => {
    const before = await require${pascal}(tx as unknown as Database, id);

    const after = await softDeleteRow(tx as unknown as Database, ${camel}, id);
    if (!after) throw ApiError.notFound("${pascal} not found");

    await record${pascal}Event(tx as unknown as Database, actor, "${resource}.deleted", id, before, after);
    return after;
  });
}`
    : `export async function delete${pascal}(
  db: Database,
  id: string,
  actor: Actor,
): Promise<${pascal}> {
  return db.transaction(async (tx) => {
    const before = await require${pascal}(tx as unknown as Database, id);

    const rows = await tx.delete(${camel}).where(eq(${camel}.id, id)).returning();
    const after = rows[0];
    if (!after) throw ApiError.notFound("${pascal} not found");

    await record${pascal}Event(tx as unknown as Database, actor, "${resource}.deleted", id, before, after);
    return after;
  });
}`;
  const lifecycleFunctions = softDelete
    ? `

export async function restore${pascal}(
  db: Database,
  id: string,
  actor: Actor,
): Promise<${pascal}> {
  return db.transaction(async (tx) => {
    const before = await require${pascal}(tx as unknown as Database, id, { includeDeleted: true });

    const after = await restoreRow(tx as unknown as Database, ${camel}, id);
    if (!after) throw ApiError.notFound("${pascal} not found");

    await record${pascal}Event(tx as unknown as Database, actor, "${resource}.restored", id, before, after);
    return after;
  });
}

export async function forceDelete${pascal}(
  db: Database,
  id: string,
  actor: Actor,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const before = await require${pascal}(tx as unknown as Database, id, { includeDeleted: true });

    await forceDeleteRow(tx as unknown as Database, ${camel}, id);

    await record${pascal}Event(tx as unknown as Database, actor, "${resource}.force_deleted", id, before, undefined);
    return { id };
  });
}`
    : "";
  return `import { ${softDelete ? "and, eq, sql" : "eq, sql"} } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
${databaseImports}
import { ApiError } from "../../http/helpers/errors.ts";
import { toOffset } from "../../http/helpers/list-query.ts";
import { orderByColumn } from "../../http/helpers/sort.ts";
import { auditChange, snapshot } from "../audit/service.ts";
import { ${camel} } from "./schema.ts";
import type { Create${pascal}Input, List${pascal}Input, Update${pascal}Input } from "./validation.ts";

export type ${pascal} = typeof ${camel}.$inferSelect;

type Actor = { userId: string | null; traceId: string; label?: string };

/**
 * Transaction boundary lives here; every write records an audit snapshot.${
   softDelete ? "\n * Reads exclude soft-deleted rows unless the caller asks for them." : ""
 }
 */
export async function list${pascal}(
  db: Database,
  input: List${pascal}Input,
): Promise<{ items: ${pascal}[]; total: number }> {
${listWhere}  const [items, count] = await Promise.all([
    db
      .select()
      .from(${camel})${listWhereClause}
      .orderBy(...orderByColumn(${camel}, input.sort, input.dir))
      .limit(input.perPage)
      .offset(toOffset(input).offset),
    db.select({ total: sql<number>\`count(*)::int\` }).from(${camel})${listWhereClause},
  ]);
  return { items, total: count[0]?.total ?? 0 };
}

${findFunction}

${requireFunction}

export async function create${pascal}(
  db: Database,
  input: Create${pascal}Input,
  actor: Actor,
): Promise<${pascal}> {
  return db.transaction(async (tx) => {
    const rows = await tx.insert(${camel}).values(${createValues}).returning();
    const after = rows[0] as ${pascal};
    await record${pascal}Event(tx as unknown as Database, actor, "${resource}.created", after.id, undefined, after);
    return after;
  });
}

${updateFunction}

${deleteFunction}${lifecycleFunctions}

/** One audit shape for every ${resource} state change; the event name is the only variable. */
async function record${pascal}Event(
  db: Database,
  actor: Actor,
  event: string,
  id: string,
  before: ${pascal} | undefined,
  after: ${pascal} | undefined,
): Promise<void> {
  await auditChange(db, {
    actor,
    event,
    subject: { type: "${resource}", id },
    ...(before ? { before: snapshot("${resource}", before) } : {}),
    ...(after ? { after: snapshot("${resource}", after) } : {}),
  });
}
`;
}

function renderSequenceOptions(sequence: { prefix?: string; padding?: number }): string {
  const parts: string[] = [];
  if (sequence.prefix !== undefined) parts.push(`prefix: ${JSON.stringify(sequence.prefix)}`);
  if (sequence.padding !== undefined) parts.push(`padding: ${sequence.padding}`);
  return parts.length > 0 ? `{ ${parts.join(", ")} }` : "{}";
}

function renderFeatureRoutes(input: {
  name: string;
  camel: string;
  pascal: string;
  softDelete: boolean;
  version: boolean;
}): string {
  const { name, camel, pascal, softDelete, version } = input;
  const refProperties = [
    `    id: { type: "string" },`,
    ...(softDelete ? [`    deletedAt: { type: "string", format: "date-time", nullable: true },`] : []),
    ...(version ? [`    version: { type: "integer" },`] : []),
  ].join("\n");
  const serviceImports = [
    `create${pascal}`,
    `delete${pascal}`,
    `find${pascal}`,
    ...(softDelete ? [`forceDelete${pascal}`] : []),
    `list${pascal}`,
    ...(softDelete ? [`restore${pascal}`] : []),
    `update${pascal}`,
  ]
    .map((symbol) => `  ${symbol},`)
    .join("\n");
  const lifecycleRoutes = softDelete
    ? `
    .post(
      "/:id/restore",
      authorize(ctx, ACTION_PERMISSION.delete),
      doc({
        tag: "${name}",
        permission: ACTION_PERMISSION.delete,
        summary: "Restore ${name}",
        data: ${camel}Ref,
      }),
      validate("param", idParam),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await restore${pascal}(ctx.db, c.req.param("id"), actor));
      },
    )
    .delete(
      "/:id/force",
      authorize(ctx, ACTION_PERMISSION.delete),
      doc({
        tag: "${name}",
        permission: ACTION_PERMISSION.delete,
        summary: "Force delete ${name}",
        data: ${camel}Ref,
      }),
      validate("param", idParam),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await forceDelete${pascal}(ctx.db, c.req.param("id"), actor));
      },
    )`
    : "";
  return `import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { authorize } from "../../http/helpers/authorize.ts";
import { ApiError, ok } from "../../http/helpers/errors.ts";
import { listMeta, listMetaSchemaProperties } from "../../http/helpers/list-query.ts";
import { idParam } from "../../http/helpers/params.ts";
import { validate } from "../../http/helpers/validate.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import {
${serviceImports}
} from "./service.ts";
import { Create${pascal}Input, List${pascal}Input, Update${pascal}Input } from "./validation.ts";

const ${camel}Ref = {
  type: "object",
  properties: {
${refProperties}
  },
} as const;

const listData = {
  type: "object",
  properties: { items: { type: "array", items: ${camel}Ref }, ...listMetaSchemaProperties },
};

/** Thin route: validation → policy → service → envelope. */
export function ${camel}Routes(ctx: AppContext) {
  return factory.createApp()
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
        const input = c.req.valid("query");
        const { items, total } = await list${pascal}(ctx.db, input);
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
      validate("param", idParam),
      async (c) => {
        const row = await find${pascal}(ctx.db, c.req.param("id"));
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
        return ok(c, await create${pascal}(ctx.db, input, actor));
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
      validate("param", idParam),
      validate("json", Update${pascal}Input),
      async (c) => {
        const actor = c.get("actor");
        const input = c.req.valid("json");
        return ok(c, await update${pascal}(ctx.db, c.req.param("id"), input, actor));
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
      validate("param", idParam),
      async (c) => {
        const actor = c.get("actor");
        return ok(c, await delete${pascal}(ctx.db, c.req.param("id"), actor));
      },
    )${lifecycleRoutes};
}
`;
}

/** Declares the feature once so `routes/api.ts` only lists it in `FEATURES`. */
function renderFeatureModule(input: { name: string; camel: string }): string {
  const { name, camel } = input;
  return `import { defineFeature } from "../../http/helpers/feature.ts";
import { ${camel}Routes } from "./route.ts";

/** Declares the ${name} feature once; routes/api.ts mounts it from the FEATURES array. */
export const ${camel}Feature = defineFeature({ name: "${name}", routes: ${camel}Routes });
`;
}

function renderFeatureTest(name: string, options: { softDelete: boolean; version: boolean }): string {
  const { softDelete, version } = options;
  const dataShape = version ? "{ id: string; version: number }" : "{ id: string }";
  const patchBody = version ? "{ expectedVersion: body.data.version }" : "{}";
  const staleCheck = version
    ? `
    // The same version cannot be used twice: optimistic locking answers 409.
    const stale = await api.app.request(
      \`/api/v1/${name}/\${body.data.id}\`,
      json({ expectedVersion: body.data.version }, "PATCH"),
    );
    expect(stale.status).toBe(409);
`
    : "";
  const restoreCheck = softDelete
    ? `
    const restored = await api.app.request(\`/api/v1/${name}/\${body.data.id}/restore\`, {
      method: "POST",
      headers: { cookie: api.cookie },
    });
    expect(restored.status).toBe(200);
`
    : "";
  const roundTripName = softDelete
    ? "create, list, update, delete, and restore round-trip"
    : "create, list, update, and delete round-trip";
  return `import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpFixture, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json", cookie: api.cookie },
  body: JSON.stringify(body),
});

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

  test("${roundTripName}", async () => {
    const created = await api.app.request("/api/v1/${name}", json({}));
    expect(created.status).toBe(200);
    const body = (await created.json()) as { data: ${dataShape} };

    const listed = await api.app.request("/api/v1/${name}?perPage=10", { headers: { cookie: api.cookie } });
    expect(((await listed.json()) as { data: { total: number } }).data.total).toBe(1);

    const patched = await api.app.request(
      \`/api/v1/${name}/\${body.data.id}\`,
      json(${patchBody}, "PATCH"),
    );
    expect(patched.status).toBe(200);
${staleCheck}
    const removed = await api.app.request(\`/api/v1/${name}/\${body.data.id}\`, {
      method: "DELETE",
      headers: { cookie: api.cookie },
    });
    expect(removed.status).toBe(200);

    const hidden = await api.app.request(\`/api/v1/${name}?perPage=10\`, { headers: { cookie: api.cookie } });
    expect(((await hidden.json()) as { data: { total: number } }).data.total).toBe(0);
${restoreCheck}  });

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
export function addAuditEntity(
  source: string,
  resource: string,
  fields: readonly string[] = ["id", "createdAt", "updatedAt"],
): WiringResult {
  const escaped = resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^\\s{2}"?${escaped}"?:\\s`, "m").test(source)) return { source, status: "present" };
  const anchor = "} as const satisfies Record<string, readonly string[]>;";
  if (!source.includes(anchor)) return { source, status: "skipped" };
  const line = `  "${resource}": [${fields.map((field) => JSON.stringify(field)).join(", ")}],`;
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

/** Registers the generated feature in routes/api.ts: one import plus one `FEATURES` entry. */
export function addRouteMount(source: string, input: { name: string; camel: string }): WiringResult {
  const { name, camel } = input;
  const importLine = `import { ${camel}Feature } from "../features/${name}/feature.ts";`;
  const featureEntry = `  ${camel}Feature,`;
  if (source.includes(importLine) && source.includes(featureEntry)) return { source, status: "present" };

  let next = source;
  if (!next.includes(importLine)) {
    const lines = next.split("\n");
    const featureImports = lines
      .map((line, index) => ({ index, path: /^import .+ from "([^"]+)";$/.exec(line)?.[1] }))
      .filter((entry): entry is { index: number; path: string } => Boolean(entry.path?.startsWith("../features/")));
    if (featureImports.length === 0) return { source, status: "skipped" };
    let insertAfter = (featureImports[0]?.index ?? 0) - 1;
    const target = `../features/${name}/feature.ts`;
    for (const entry of featureImports) if (entry.path < target) insertAfter = entry.index;
    lines.splice(insertAfter + 1, 0, importLine);
    next = lines.join("\n");
  }

  if (!next.includes(featureEntry)) {
    const lines = next.split("\n");
    const closing = lines.indexOf("] as const satisfies readonly FeatureDefinition[];");
    if (closing === -1) return { source, status: "skipped" };
    lines.splice(closing, 0, featureEntry);
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
import type { Column } from "@bun-erp/data-table/server-table";
import { ResourceTable } from "@bun-erp/data-table/resource-table";
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
              onRetry={() => void rows.refetch()}
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

export type NavOverride = { titleKey?: string; url?: string; icon?: string; permission?: string };

/** Adds the sidebar entry (and its icon import) for the generated web screen. */
export function addNavItem(source: string, feature: { name: string }, nav: NavOverride = {}): WiringResult {
  const { name } = feature;
  const titleKey = nav.titleKey ?? `navigation.${name}`;
  const url = nav.url ?? `/${name}`;
  const icon = nav.icon ?? "FileText";
  const permission = nav.permission ?? `${name}.read`;
  if (source.includes(`"${titleKey}"`)) return { source, status: "present" };
  const itemsAnchor = "    items: [";
  // The lucide import already carries icons; find it wherever it is instead of assuming an anchor.
  const lucide = /^import \{([^}]+)\} from "lucide-react";$/m.exec(source);
  if (!lucide || !source.includes(itemsAnchor)) return { source, status: "skipped" };

  let next = source;
  if (!new RegExp(`\\b${icon}\\b`).test(next)) {
    next = next.replace(lucide[0], `import { ${icon},${lucide[1]}} from "lucide-react";`);
  }
  const at = next.indexOf(itemsAnchor) + itemsAnchor.length;
  const line = `\n      { titleKey: "${titleKey}", url: "${url}", icon: ${icon}, permission: "${permission}" },`;
  next = `${next.slice(0, at)}${line}${next.slice(at)}`;
  return { source: next, status: "added" };
}

const I18N_ANCHORS = {
  "en-US": "} as const;",
  "id-ID": "} satisfies Record<keyof typeof enUS, string>;",
} as const;

/**
 * Adds the screen's message keys to one catalog. Missing keys break the typed catalog at build time.
 * Only keys the catalog does not already hold are appended, so two catalog features that share
 * generic copy (`common.add`) never write a duplicate object key.
 */
export function addI18nKeys(
  source: string,
  feature: { name: string },
  locale: "en-US" | "id-ID",
  keys?: Record<string, string>,
): WiringResult {
  const { name } = feature;
  const label = humanizeName(name);
  const lower = label.toLowerCase();
  const messages =
    keys ??
    (locale === "en-US"
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
        });
  const missing = Object.entries(messages).filter(([key]) => !source.includes(`${JSON.stringify(key)}:`));
  if (missing.length === 0) return { source, status: "present" };
  const anchor = I18N_ANCHORS[locale];
  const at = source.lastIndexOf(anchor);
  if (at === -1) return { source, status: "skipped" };
  const lines = missing.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join("\n");
  return { source: `${source.slice(0, at)}${lines}\n${source.slice(at)}`, status: "added" };
}
