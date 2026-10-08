import factoryTemplate from "../../templates/generators/factory/factory.ts.tmpl" with { type: "text" };
import featureModuleTemplate from "../../templates/generators/feature/feature.ts.tmpl" with { type: "text" };
import migrationDeletedAtColumnTemplate from "../../templates/generators/feature/fragments/migration-deleted-at-column.tmpl" with {
  type: "text",
};
import migrationNumberColumnTemplate from "../../templates/generators/feature/fragments/migration-number-column.tmpl" with {
  type: "text",
};
import migrationVersionColumnTemplate from "../../templates/generators/feature/fragments/migration-version-column.tmpl" with {
  type: "text",
};
import routeLifecycleSoftTemplate from "../../templates/generators/feature/fragments/route-lifecycle-soft.tmpl" with {
  type: "text",
};
import routeRefDeletedAtTemplate from "../../templates/generators/feature/fragments/route-ref-deleted-at.tmpl" with {
  type: "text",
};
import routeRefVersionTemplate from "../../templates/generators/feature/fragments/route-ref-version.tmpl" with {
  type: "text",
};
import schemaDeletedAtColumnTemplate from "../../templates/generators/feature/fragments/schema-deleted-at-column.tmpl" with {
  type: "text",
};
import schemaImportOptimisticTemplate from "../../templates/generators/feature/fragments/schema-import-optimistic.tmpl" with {
  type: "text",
};
import schemaImportSoftDeleteTemplate from "../../templates/generators/feature/fragments/schema-import-soft-delete.tmpl" with {
  type: "text",
};
import schemaNumberColumnTemplate from "../../templates/generators/feature/fragments/schema-number-column.tmpl" with {
  type: "text",
};
import schemaVersionColumnTemplate from "../../templates/generators/feature/fragments/schema-version-column.tmpl" with {
  type: "text",
};
import serviceCreateValuesPlainTemplate from "../../templates/generators/feature/fragments/service-create-values-plain.tmpl" with {
  type: "text",
};
import serviceCreateValuesSequencedTemplate from "../../templates/generators/feature/fragments/service-create-values-sequenced.tmpl" with {
  type: "text",
};
import serviceDeletePlainTemplate from "../../templates/generators/feature/fragments/service-delete-plain.tmpl" with {
  type: "text",
};
import serviceDeleteSoftTemplate from "../../templates/generators/feature/fragments/service-delete-soft.tmpl" with {
  type: "text",
};
import serviceDocSoftDeleteTemplate from "../../templates/generators/feature/fragments/service-doc-soft-delete.tmpl" with {
  type: "text",
};
import serviceFindCurrentPlainTemplate from "../../templates/generators/feature/fragments/service-find-current-plain.tmpl" with {
  type: "text",
};
import serviceFindCurrentSoftTemplate from "../../templates/generators/feature/fragments/service-find-current-soft.tmpl" with {
  type: "text",
};
import serviceFindPlainTemplate from "../../templates/generators/feature/fragments/service-find-plain.tmpl" with {
  type: "text",
};
import serviceFindSoftTemplate from "../../templates/generators/feature/fragments/service-find-soft.tmpl" with {
  type: "text",
};
import serviceImportNumberingTemplate from "../../templates/generators/feature/fragments/service-import-numbering.tmpl" with {
  type: "text",
};
import serviceImportOptimisticTemplate from "../../templates/generators/feature/fragments/service-import-optimistic.tmpl" with {
  type: "text",
};
import serviceImportSoftDeleteTemplate from "../../templates/generators/feature/fragments/service-import-soft-delete.tmpl" with {
  type: "text",
};
import serviceLifecycleSoftTemplate from "../../templates/generators/feature/fragments/service-lifecycle-soft.tmpl" with {
  type: "text",
};
import serviceListWhereSoftTemplate from "../../templates/generators/feature/fragments/service-list-where-soft.tmpl" with {
  type: "text",
};
import serviceRequirePlainTemplate from "../../templates/generators/feature/fragments/service-require-plain.tmpl" with {
  type: "text",
};
import serviceRequireSoftTemplate from "../../templates/generators/feature/fragments/service-require-soft.tmpl" with {
  type: "text",
};
import serviceUpdatePlainTemplate from "../../templates/generators/feature/fragments/service-update-plain.tmpl" with {
  type: "text",
};
import serviceUpdateVersionedTemplate from "../../templates/generators/feature/fragments/service-update-versioned.tmpl" with {
  type: "text",
};
import testDataShapePlainTemplate from "../../templates/generators/feature/fragments/test-data-shape-plain.tmpl" with {
  type: "text",
};
import testDataShapeVersionedTemplate from "../../templates/generators/feature/fragments/test-data-shape-versioned.tmpl" with {
  type: "text",
};
import testPatchBodyPlainTemplate from "../../templates/generators/feature/fragments/test-patch-body-plain.tmpl" with {
  type: "text",
};
import testPatchBodyVersionedTemplate from "../../templates/generators/feature/fragments/test-patch-body-versioned.tmpl" with {
  type: "text",
};
import testRestoreCheckTemplate from "../../templates/generators/feature/fragments/test-restore-check.tmpl" with {
  type: "text",
};
import testStaleCheckTemplate from "../../templates/generators/feature/fragments/test-stale-check.tmpl" with {
  type: "text",
};
import validationExpectedVersionTemplate from "../../templates/generators/feature/fragments/validation-expected-version.tmpl" with {
  type: "text",
};
import validationIncludeDeletedTemplate from "../../templates/generators/feature/fragments/validation-include-deleted.tmpl" with {
  type: "text",
};
import indexTemplate from "../../templates/generators/feature/index.ts.tmpl" with { type: "text" };
import migrationAlterTemplate from "../../templates/generators/feature/migration-alter.ts.tmpl" with { type: "text" };
import migrationCreateTemplate from "../../templates/generators/feature/migration-create.ts.tmpl" with { type: "text" };
import migrationStubTemplate from "../../templates/generators/feature/migration-stub.ts.tmpl" with { type: "text" };
import policyTemplate from "../../templates/generators/feature/policy.ts.tmpl" with { type: "text" };
import routeTemplate from "../../templates/generators/feature/route.ts.tmpl" with { type: "text" };
import schemaTemplate from "../../templates/generators/feature/schema.ts.tmpl" with { type: "text" };
import seederTemplate from "../../templates/generators/feature/seeder.ts.tmpl" with { type: "text" };
import serviceTemplate from "../../templates/generators/feature/service.ts.tmpl" with { type: "text" };
import testTemplate from "../../templates/generators/feature/test.ts.tmpl" with { type: "text" };
import validationTemplate from "../../templates/generators/feature/validation.ts.tmpl" with { type: "text" };
import webDesignTemplate from "../../templates/generators/feature/web-design.json.tmpl" with { type: "text" };
import webHooksTemplate from "../../templates/generators/feature/web-hooks.ts.tmpl" with { type: "text" };
import webQueriesTemplate from "../../templates/generators/feature/web-queries.ts.tmpl" with { type: "text" };
import webRouteTemplate from "../../templates/generators/feature/web-route.ts.tmpl" with { type: "text" };
import webScreenTemplate from "../../templates/generators/feature/web-screen.ts.tmpl" with { type: "text" };
import webTypesTemplate from "../../templates/generators/feature/web-types.ts.tmpl" with { type: "text" };
import { renderTemplate } from "./template.ts";
import { WIRING_MARKERS, type WiringStatus, wiringPresence } from "./wiring.ts";

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
    return renderTemplate(
      migrationCreateTemplate,
      {
        table: intent.table,
        numberColumn: intent.numbering ? migrationNumberColumnTemplate : "",
        deletedAtColumn: intent.softDelete ? migrationDeletedAtColumnTemplate : "",
        versionColumn: intent.version === false ? "" : migrationVersionColumnTemplate,
      },
      "migration-create",
    );
  }
  if (intent?.mode === "alter" && intent.table) {
    return renderTemplate(
      migrationAlterTemplate,
      { table: intent.table, column: intent.column ?? "new_column" },
      "migration-alter",
    );
  }
  return migrationStubTemplate;
}

export function renderSeederSource(name = "feature"): string {
  return renderTemplate(seederTemplate, { pascal: toPascalName(name) }, "seeder");
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
      path: `apps/server/features/${name}/index.ts`,
      contents: renderFeatureIndex({ name, camel, pascal, softDelete }),
    },
    {
      path: `apps/server/database/factories/${name}.ts`,
      contents: renderFactorySource({ name, export: camel, sequenced: options.sequence !== undefined }),
    },
    {
      path: `apps/server/tests/features/${name}/${name}.test.ts`,
      contents: renderFeatureTest(name, camel, { softDelete, version }),
    },
  ];
  return { name, resource: name, table, pascal, camel, files };
}

function renderFeaturePolicy(resource: string): string {
  return renderTemplate(policyTemplate, { resource }, "feature policy");
}

function renderFeatureSchema(input: {
  table: string;
  camel: string;
  sequenced: boolean;
  softDelete: boolean;
  version: boolean;
}): string {
  const { table, camel, sequenced, softDelete, version } = input;
  const databaseImports = [
    ...(version ? [schemaImportOptimisticTemplate] : []),
    ...(softDelete ? [schemaImportSoftDeleteTemplate] : []),
  ]
    .map((line) => `\n${line}`)
    .join("");
  return renderTemplate(
    schemaTemplate,
    {
      table,
      camel,
      pgImports: sequenced ? "pgTable, text, timestamp, uuid" : "pgTable, timestamp, uuid",
      databaseImports,
      numberColumn: sequenced ? schemaNumberColumnTemplate : "",
      deletedAtColumn: softDelete ? schemaDeletedAtColumnTemplate : "",
      versionColumn: version ? schemaVersionColumnTemplate : "",
    },
    "feature schema",
  );
}

function renderFeatureValidation(pascal: string, input: { softDelete: boolean; version: boolean }): string {
  return renderTemplate(
    validationTemplate,
    {
      pascal,
      expectedVersion: input.version ? validationExpectedVersionTemplate : "",
      includeDeleted: input.softDelete ? validationIncludeDeletedTemplate : "",
    },
    "feature validation",
  );
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
    ? renderTemplate(
        serviceCreateValuesSequencedTemplate,
        {
          sequenceKey: JSON.stringify(sequence.key),
          sequenceOptions: renderSequenceOptions(sequence),
        },
        "service create values",
      )
    : serviceCreateValuesPlainTemplate;
  const databaseImports = [
    ...(sequence ? [serviceImportNumberingTemplate] : []),
    ...(version ? [serviceImportOptimisticTemplate] : []),
    ...(softDelete ? [serviceImportSoftDeleteTemplate] : []),
  ].join("\n");
  const listWhere = softDelete ? renderTemplate(serviceListWhereSoftTemplate, { camel }, "service list where") : "";
  const listWhereClause = softDelete ? ".where(where)" : "";
  const findFunction = renderTemplate(
    softDelete ? serviceFindSoftTemplate : serviceFindPlainTemplate,
    { camel, pascal },
    "service find",
  );
  const requireFunction = renderTemplate(
    softDelete ? serviceRequireSoftTemplate : serviceRequirePlainTemplate,
    { camel, pascal },
    "service require",
  );
  const findCurrent = renderTemplate(
    softDelete ? serviceFindCurrentSoftTemplate : serviceFindCurrentPlainTemplate,
    { pascal },
    "service find current",
  );
  const updateFunction = renderTemplate(
    version ? serviceUpdateVersionedTemplate : serviceUpdatePlainTemplate,
    { camel, pascal, resource, findCurrent },
    "service update",
  );
  const deleteFunction = renderTemplate(
    softDelete ? serviceDeleteSoftTemplate : serviceDeletePlainTemplate,
    { camel, pascal, resource },
    "service delete",
  );
  const lifecycleFunctions = softDelete
    ? renderTemplate(serviceLifecycleSoftTemplate, { camel, pascal, resource }, "service lifecycle")
    : "";
  const softDeleteDoc = softDelete ? serviceDocSoftDeleteTemplate : "";
  return renderTemplate(
    serviceTemplate,
    {
      resource,
      camel,
      pascal,
      drizzleImports: softDelete ? "and, eq, sql" : "eq, sql",
      databaseImports,
      createValues,
      listWhere,
      listWhereClause,
      findFunction,
      requireFunction,
      updateFunction,
      deleteFunction,
      lifecycleFunctions,
      softDeleteDoc,
    },
    "feature service",
  );
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
  const refExtras = [
    ...(softDelete ? [routeRefDeletedAtTemplate] : []),
    ...(version ? [routeRefVersionTemplate] : []),
  ].join("");
  const serviceImports = featureServiceSymbols(pascal, softDelete)
    .map((symbol) => `  ${symbol},`)
    .join("\n");
  const lifecycleRoutes = softDelete
    ? renderTemplate(routeLifecycleSoftTemplate, { name, camel, pascal }, "route lifecycle")
    : "";
  return renderTemplate(
    routeTemplate,
    { name, camel, pascal, refExtras, serviceImports, lifecycleRoutes },
    "feature routes",
  );
}

/** The service symbols a feature exposes publicly; its route and index import the same set. */
function featureServiceSymbols(pascal: string, softDelete: boolean): string[] {
  return [
    `create${pascal}`,
    `delete${pascal}`,
    `find${pascal}`,
    ...(softDelete ? [`forceDelete${pascal}`] : []),
    `list${pascal}`,
    ...(softDelete ? [`restore${pascal}`] : []),
    `update${pascal}`,
  ];
}

/** Declares the feature once so `routes/api.ts` only lists it in `FEATURES`. */
function renderFeatureModule(input: { name: string; camel: string }): string {
  const { name, camel } = input;
  return renderTemplate(featureModuleTemplate, { name, camel }, "feature module");
}

/** Public surface: later features import `<name>` only through this file (feature-boundary rule). */
function renderFeatureIndex(input: { name: string; camel: string; pascal: string; softDelete: boolean }): string {
  const { name, camel, pascal, softDelete } = input;
  const serviceExports = featureServiceSymbols(pascal, softDelete)
    .map((symbol) => `  ${symbol},`)
    .join("\n");
  return renderTemplate(indexTemplate, { name, camel, pascal, serviceExports }, "feature index");
}

/**
 * A factory for one feature table. A sequenced table has a notNull `number` column without a
 * database default, so the factory fills it; every other generated column has a default.
 */
export function renderFactorySource(input: { name: string; export: string; sequenced: boolean }): string {
  const prefix = input.name.toUpperCase();
  return renderTemplate(
    factoryTemplate,
    {
      name: input.name,
      export: input.export,
      param: input.sequenced ? "n" : "_n",
      values: input.sequenced ? `{ number: \`${prefix}-\${n}\` }` : "{}",
    },
    "factory",
  );
}

function renderFeatureTest(name: string, camel: string, options: { softDelete: boolean; version: boolean }): string {
  const { softDelete, version } = options;
  const roundTripName = softDelete
    ? "create, list, update, delete, and restore round-trip"
    : "create, list, update, and delete round-trip";
  return renderTemplate(
    testTemplate,
    {
      name,
      camel,
      roundTripName,
      dataShape: version ? testDataShapeVersionedTemplate : testDataShapePlainTemplate,
      patchBody: version ? testPatchBodyVersionedTemplate : testPatchBodyPlainTemplate,
      staleCheck: version ? renderTemplate(testStaleCheckTemplate, { name }, "test stale check") : "",
      restoreCheck: softDelete ? renderTemplate(testRestoreCheckTemplate, { name }, "test restore check") : "",
    },
    "feature test",
  );
}

export type WiringResult = { source: string; status: WiringStatus; reason?: string };

/** Registers the generated entity's snapshot allowlist so audit writes cannot silently drop fields. */
export function addAuditEntity(
  source: string,
  resource: string,
  fields: readonly string[] = ["id", "createdAt", "updatedAt"],
): WiringResult {
  const marker = WIRING_MARKERS.audit;
  const escaped = resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const state = wiringPresence(source, marker, [new RegExp(`^\\s{2}"?${escaped}"?:\\s`, "m")]);
  if (state === "present") return { source, status: "present" };
  if (state === "partial") {
    return {
      source,
      status: "partial",
      reason: `the ${marker} marker and the "${resource}" allowlist entry disagree; complete or revert the wiring`,
    };
  }
  if (state === "skipped") return { source, status: "skipped", reason: `the ${marker} marker is missing` };
  const line = `  "${resource}": [${fields.map((field) => JSON.stringify(field)).join(", ")}],`;
  const at = source.indexOf(marker) + marker.length;
  return { source: `${source.slice(0, at)}\n${line}${source.slice(at)}`, status: "added" };
}

/** Registers `<resource>: ["create", "read", "update", "delete"]` in the permission statements. */
export function addStatementResource(source: string, resource: string): WiringResult {
  const marker = WIRING_MARKERS.permissions;
  const escaped = resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const state = wiringPresence(source, marker, [new RegExp(`^\\s{2}"?${escaped}"?:\\s`, "m")]);
  if (state === "present") return { source, status: "present" };
  if (state === "partial") {
    return {
      source,
      status: "partial",
      reason: `the ${marker} marker and the "${resource}" statement disagree; complete or revert the wiring`,
    };
  }
  if (state === "skipped") return { source, status: "skipped", reason: `the ${marker} marker is missing` };
  const line = `  "${resource}": ["create", "read", "update", "delete"],`;
  const at = source.indexOf(marker) + marker.length;
  return { source: `${source.slice(0, at)}\n${line}${source.slice(at)}`, status: "added" };
}

/** Registers the generated feature in routes/api.ts: one import plus one `FEATURES` entry. */
export function addRouteMount(source: string, input: { name: string; camel: string }): WiringResult {
  const { name, camel } = input;
  const marker = WIRING_MARKERS.routes;
  const importLine = `import { ${camel}Feature } from "../features/${name}/feature.ts";`;
  const featureEntry = `  ${camel}Feature,`;
  const state = wiringPresence(source, marker, [importLine, featureEntry]);
  if (state === "present") return { source, status: "present" };
  if (state === "partial") {
    return {
      source,
      status: "partial",
      reason: `the ${marker} marker, the feature import and the FEATURES entry disagree; complete or revert the wiring`,
    };
  }
  if (state === "skipped") return { source, status: "skipped", reason: `the ${marker} marker is missing` };

  let next = source;
  if (!next.includes(importLine)) {
    const lines = next.split("\n");
    const featureImports = lines
      .map((line, index) => ({ index, path: /^import .+ from "([^"]+)";$/.exec(line)?.[1] }))
      .filter((entry): entry is { index: number; path: string } => Boolean(entry.path?.startsWith("../features/")));
    if (featureImports.length === 0) {
      return { source, status: "skipped", reason: "the feature-import anchor is missing" };
    }
    let insertAfter = (featureImports[0]?.index ?? 0) - 1;
    const target = `../features/${name}/feature.ts`;
    for (const entry of featureImports) if (entry.path < target) insertAfter = entry.index;
    lines.splice(insertAfter + 1, 0, importLine);
    next = lines.join("\n");
  }

  if (!next.includes(featureEntry)) {
    const at = next.indexOf(marker) + marker.length;
    next = `${next.slice(0, at)}\n${featureEntry}${next.slice(at)}`;
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
      // The design gate blocks a screen without a direction spec; the generated one is INHERITED.
      { path: `apps/web/design/${name}.json`, contents: renderWebDesign(name) },
    ],
  };
}

function renderWebTypes(name: string, pascal: string): string {
  return renderTemplate(webTypesTemplate, { name, nameJson: JSON.stringify(name), pascal }, "web types");
}

function renderWebQueries(name: string, camel: string): string {
  const access = /^[A-Za-z_$][\w$]*$/.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`;
  return renderTemplate(webQueriesTemplate, { name, camel, access }, "web queries");
}

function renderWebHooks(pascal: string, camel: string): string {
  return renderTemplate(webHooksTemplate, { pascal, camel }, "web hooks");
}

function renderWebScreen(name: string, pascal: string): string {
  return renderTemplate(webScreenTemplate, { name, pascal }, "web screen");
}

function renderWebRoute(name: string, pascal: string): string {
  return renderTemplate(webRouteTemplate, { name, pascal }, "web route");
}

/** The generated screen inherits the reviewed resource-table direction until a human reviews it. */
function renderWebDesign(name: string): string {
  return renderTemplate(webDesignTemplate, { name }, "web design");
}

export type NavOverride = { titleKey?: string; url?: string; icon?: string; permission?: string };

/** Adds the sidebar entry (and its icon import) for the generated web screen. */
export function addNavItem(source: string, feature: { name: string }, nav: NavOverride = {}): WiringResult {
  const { name } = feature;
  const titleKey = nav.titleKey ?? `navigation.${name}`;
  const url = nav.url ?? `/${name}`;
  const icon = nav.icon ?? "FileText";
  const permission = nav.permission ?? `${name}.read`;
  const marker = WIRING_MARKERS.nav;
  const state = wiringPresence(source, marker, [`"${titleKey}"`]);
  if (state === "present") return { source, status: "present" };
  if (state === "partial") {
    return {
      source,
      status: "partial",
      reason: `the ${marker} marker and the "${titleKey}" nav entry disagree; complete or revert the wiring`,
    };
  }
  if (state === "skipped") return { source, status: "skipped", reason: `the ${marker} marker is missing` };
  // The lucide import already carries icons; find it wherever it is instead of assuming an anchor.
  const lucide = /^import \{([^}]+)\} from "lucide-react";$/m.exec(source);
  if (!lucide) {
    return { source, status: "skipped", reason: "the lucide import is missing" };
  }

  let next = source;
  if (!new RegExp(`\\b${icon}\\b`).test(next)) {
    next = next.replace(lucide[0], () => `import { ${icon},${lucide[1]}} from "lucide-react";`);
  }
  const at = next.indexOf(marker) + marker.length;
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
  if (at === -1) return { source, status: "skipped", reason: `the ${locale} catalog closing anchor is missing` };
  const lines = missing.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join("\n");
  return { source: `${source.slice(0, at)}${lines}\n${source.slice(at)}`, status: "added" };
}
