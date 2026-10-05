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

export function renderMigrationSource(): string {
  return `import type { Database } from "../platform/database/index.ts";

/** Add one forward-only, transactional schema change before applying this migration. */
export async function up(_database: Database): Promise<void> {
  throw new Error("Migration is not implemented; add the schema change before running db:migrate");
}
`;
}

export function renderSeederSource(): string {
  return `import type { Database } from "../platform/database/index.ts";

/** Keep seed data deterministic and idempotent; db:seed may run this more than once. */
export async function seed(database: Database): Promise<void> {
  void database;
}
`;
}

export function renderFeatureGuide(name: string): string {
  return [
    `# ${toPascalName(name)} feature`,
    "",
    `This is the ownership boundary for the ${name} server feature. Add only the files the feature needs; do not create empty frontend or mobile folders.`,
    "",
    "## Server responsibilities",
    "",
    "- validation.ts: request and query schemas.",
    "- policy.ts: stable permission keys used by routes.",
    "- schema.ts: Drizzle table declarations; add a numbered migration with bun erp make:migration.",
    "- service.ts: feature operations, transaction boundaries, and audit writes.",
    "- route.ts: thin Hono route chain that validates, authorizes, and calls the service.",
    `- apps/server/http/routes.ts: explicitly mount the router under /api/v1/${name} so Hono RPC keeps its inferred route type.`,
    `- apps/server/tests/features/${name}/: feature behavior tests; use the shared HTTP fixture.`,
    "",
    "Do not invent domain fields or permissions from the feature name. Define them from the product requirements before creating schema or API behavior. Add web/mobile api, components, hooks, providers, stores, and types only when those clients need them.",
    "",
  ].join("\n");
}
