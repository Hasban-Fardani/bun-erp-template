import type { Database } from "../../database/index.ts";
import type { ListQuery } from "../../http/helpers/list-query.ts";

/**
 * The app registers one entry per importable/exportable resource. The wizard reads `columns` for
 * mapping, the dry run calls `validateRow`, the batch handler calls `importRow`, and the export
 * action calls `list` — the same function the resource's own table endpoint uses, so a file
 * exports exactly what the screen lists.
 */

export type ImportExportColumn = {
  key: string;
  header: string;
  required?: boolean;
  /** Excel column width in characters. */
  width?: number;
  /** Excel number format for exported values, e.g. `yyyy-mm-dd` or `#,##0`. */
  numFmt?: string;
};

/** Every cell arrives as a trimmed string; a resource parses the values it owns. */
export type ImportRowValues = Readonly<Record<string, string>>;

/** The web parses the uploaded file; the server receives headers plus string rows. */
export type ImportSource = {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
};

/** One exported cell after JSON transport; dates arrive as ISO strings. */
export type ExportCell = string | number | boolean | null;

export type ImportRowIssue = { column?: string; code: string; message: string };

export type ImportRowContext = { batchId: string; itemKey: string; attempt: number };

export type ImportExportListQuery = ListQuery & { search?: string };

export type ImportExportResource = {
  name: string;
  label: string;
  columns: readonly ImportExportColumn[];
  /** Per-row dry-run validation after mapping; an empty array means the row can be imported. */
  validateRow?: (values: ImportRowValues) => readonly ImportRowIssue[];
  /** Batch item handler. Must be idempotent: a resumed batch can deliver the same row again. */
  importRow?: (db: Database, values: ImportRowValues, context: ImportRowContext) => Promise<void>;
  /** Server list contract of the resource's table; used by the export action. */
  list?: (
    db: Database,
    query: ImportExportListQuery,
  ) => Promise<{
    items: readonly Record<string, unknown>[];
    total: number;
  }>;
};

const RESOURCE_NAME = /^[a-z][a-z0-9-]{0,62}$/;
const COLUMN_KEY = /^[a-z][a-zA-Z0-9_]{0,62}$/;

class ImportExportResourceRegistry {
  readonly #resources = new Map<string, ImportExportResource>();

  register(resource: ImportExportResource): void {
    if (!RESOURCE_NAME.test(resource.name)) throw new Error("Resource names must be stable kebab-case identifiers");
    if (resource.label.trim().length === 0) throw new Error(`Resource ${resource.name} needs a label`);
    if (resource.columns.length === 0) throw new Error(`Resource ${resource.name} needs at least one column`);
    const keys = new Set<string>();
    for (const column of resource.columns) {
      if (!COLUMN_KEY.test(column.key)) throw new Error(`Invalid column key on ${resource.name}: ${column.key}`);
      if (keys.has(column.key)) throw new Error(`Duplicate column key on ${resource.name}: ${column.key}`);
      keys.add(column.key);
    }
    if (this.#resources.has(resource.name)) throw new Error(`Resource already registered: ${resource.name}`);
    this.#resources.set(resource.name, resource);
  }

  get(name: string): ImportExportResource | undefined {
    return this.#resources.get(name);
  }

  list(): ImportExportResource[] {
    return [...this.#resources.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

/**
 * Module-level on purpose: the app registers resources from its composition root before the first
 * request, and both the HTTP routes and the batch handler resolve them from this one registry.
 */
export const importExportResources = new ImportExportResourceRegistry();

export function registerImportExportResource(resource: ImportExportResource): void {
  importExportResources.register(resource);
}
