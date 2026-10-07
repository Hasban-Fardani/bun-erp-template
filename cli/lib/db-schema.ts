import { fileIndex } from "./file-index.ts";

/**
 * Database schema introspection without a connection. Drizzle declarations
 * (`apps/server/**&#47;schema.ts`) are the runtime truth; the SQL migrations show what an installed
 * database actually receives (Better Auth tables, function defaults, indexes). The MCP `db-schema`
 * tool merges both so an agent sees the schema it will query.
 */

export type SchemaColumn = {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  unique: boolean;
  default: string | null;
  references: string | null;
};

export type SchemaIndex = { name: string; columns: string[]; unique: boolean };

export type SchemaTable = {
  name: string;
  columns: SchemaColumn[];
  indexes: SchemaIndex[];
  sources: string[];
};

/** Splits on top-level separators, ignoring strings, template literals and nested brackets. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' || char === "'" || char === "`") {
      const close = readString(text, index);
      current += text.slice(index, close);
      index = close - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      const lineEnd = text.indexOf("\n", index);
      index = lineEnd < 0 ? text.length : lineEnd;
      continue;
    }
    if (char === "/" && next === "*") {
      const blockEnd = text.indexOf("*/", index + 2);
      index = blockEnd < 0 ? text.length : blockEnd + 1;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) parts.push(current);
  return parts;
}

/** Index just past a quoted string starting at `start`; backtick templates keep their `${...}`. */
function readString(text: string, start: number): number {
  const quote = text[start];
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === quote) return index + 1;
    if (quote === "`" && char === "$" && text[index + 1] === "{") {
      const close = findMatching(text, index + 1, "{", "}");
      index = close;
    }
  }
  return text.length;
}

function findMatching(text: string, open: number, openChar: string, closeChar: string): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' || char === "'" || char === "`") {
      index = readString(text, index) - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      const lineEnd = text.indexOf("\n", index);
      index = lineEnd < 0 ? text.length : lineEnd;
      continue;
    }
    if (char === "/" && next === "*") {
      const blockEnd = text.indexOf("*/", index + 2);
      index = blockEnd < 0 ? text.length : blockEnd + 1;
      continue;
    }
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

function firstString(text: string): string | undefined {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' || char === "'") {
      const end = readString(text, index);
      return text.slice(index + 1, end - 1);
    }
  }
  return undefined;
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function parseDrizzleColumns(
  columnsText: string,
  tableExports: ReadonlyMap<string, string>,
): { columns: SchemaColumn[]; byKey: Map<string, string> } {
  const columns: SchemaColumn[] = [];
  const byKey = new Map<string, string>();
  for (const entry of splitTopLevel(columnsText, ",")) {
    const colon = entry.indexOf(":");
    if (colon < 0) continue;
    const key = entry.slice(0, colon).trim();
    const expression = entry.slice(colon + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    const name = firstString(expression) ?? toSnakeCase(key);
    const type = /^\s*([A-Za-z][A-Za-z0-9]*)\s*\(/.exec(expression)?.[1] ?? "unknown";
    const defaultOpen = /\.default\s*\(/.exec(expression);
    const defaultValue = defaultOpen
      ? expression
          .slice(
            defaultOpen.index + defaultOpen[0].length,
            findMatching(expression, defaultOpen.index + defaultOpen[0].length - 1, "(", ")"),
          )
          .trim()
          .replace(/^sql`([^`]*)`$/, "$1")
      : /\.defaultNow\s*\(/.test(expression)
        ? "now()"
        : null;
    const reference = /\.references\s*\(\s*\(\s*\)\s*=>\s*([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/.exec(expression);
    const referenceTable = reference?.[1] ? (tableExports.get(reference[1]) ?? reference[1]) : undefined;
    columns.push({
      name,
      type,
      notNull: /\.notNull\s*\(/.test(expression),
      primaryKey: /\.primaryKey\s*\(/.test(expression),
      unique: /\.unique\s*\(/.test(expression),
      default: defaultValue && defaultValue.length > 0 ? defaultValue : null,
      references: referenceTable && reference?.[2] ? `${referenceTable}.${reference[2]}` : null,
    });
    byKey.set(key, name);
  }
  return { columns, byKey };
}

function parseDrizzleIndexes(indexText: string, byKey: ReadonlyMap<string, string>): SchemaIndex[] {
  const indexes: SchemaIndex[] = [];
  const resolve = (columnRef: string) => {
    const key = columnRef.split(".").at(-1) ?? "";
    return byKey.get(key) ?? toSnakeCase(key);
  };
  for (const match of indexText.matchAll(/(unique)?Index\s*\(\s*["']([^"']+)["']\s*\)\s*\.on\s*\(([^)]*)\)/g)) {
    const columns = [...(match[3] ?? "").matchAll(/[A-Za-z0-9_]+\.([A-Za-z0-9_]+)/g)].map((entry) => resolve(entry[0]));
    indexes.push({ name: match[2] ?? "", columns, unique: Boolean(match[1]) });
  }
  const primary = /primaryKey\s*\(\s*\{\s*columns:\s*\[([^\]]*)\]/.exec(indexText);
  if (primary?.[1]) {
    const columns = [...primary[1].matchAll(/[A-Za-z0-9_]+\.([A-Za-z0-9_]+)/g)].map((entry) => resolve(entry[0]));
    indexes.push({ name: "primary", columns, unique: true });
  }
  return indexes;
}

function parseDrizzleFile(text: string, source: string, tableExports: ReadonlyMap<string, string>): SchemaTable[] {
  const tables: SchemaTable[] = [];
  for (const match of text.matchAll(/export\s+const\s+[A-Za-z0-9_]+\s*=\s*pgTable\s*\(/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const close = findMatching(text, open, "(", ")");
    const args = text.slice(open + 1, close);
    const name = firstString(args);
    if (!name) continue;
    const nameEnd = args.indexOf(name) + name.length;
    const columnsOpen = args.indexOf("{", nameEnd);
    if (columnsOpen < 0) continue;
    const columnsClose = findMatching(args, columnsOpen, "{", "}");
    const columnsText = args.slice(columnsOpen + 1, columnsClose);
    const indexText = args.slice(columnsClose + 1);
    const { columns, byKey } = parseDrizzleColumns(columnsText, tableExports);
    tables.push({
      name,
      columns,
      indexes: parseDrizzleIndexes(indexText, byKey),
      sources: [source],
    });
  }
  return tables;
}

function parseMigrationColumns(body: string): SchemaColumn[] {
  const columns: SchemaColumn[] = [];
  for (const entry of splitTopLevel(body, ",")) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    if (/^(constraint|primary\s+key|unique\s*\(|foreign\s+key|check\s*\()/i.test(trimmed)) continue;
    const nameMatch = /^"?([A-Za-z0-9_]+)"?\s+([\s\S]+)$/.exec(trimmed);
    if (!nameMatch?.[1] || !nameMatch[2]) continue;
    const name = nameMatch[1];
    const definition = nameMatch[2];
    const type = /^([A-Za-z][A-Za-z0-9_]*(?:\s*\([^)]*\))?)/.exec(definition)?.[1] ?? "unknown";
    const defaultMatch = /\bdefault\s+([\s\S]+?)(?=\s+(?:references|check|unique|primary|not)\b|$)/i.exec(definition);
    const reference = /\breferences\s+"?([A-Za-z0-9_]+)"?\s*\(\s*"?([A-Za-z0-9_]+)"?\s*\)/i.exec(definition);
    columns.push({
      name,
      type,
      notNull: /\bnot\s+null\b/i.test(definition),
      primaryKey: /\bprimary\s+key\b/i.test(definition),
      unique: /\bunique\b/i.test(definition),
      default: defaultMatch?.[1]?.trim() ?? null,
      references: reference?.[1] && reference[2] ? `${reference[1]}.${reference[2]}` : null,
    });
  }
  return columns;
}

function parseMigrationFile(text: string, source: string): SchemaTable[] {
  const tables: SchemaTable[] = [];
  for (const match of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?"?([A-Za-z0-9_]+)"?\s*\(/gi)) {
    const name = match[1];
    if (!name) continue;
    const open = (match.index ?? 0) + match[0].length - 1;
    const close = findMatching(text, open, "(", ")");
    tables.push({
      name,
      columns: parseMigrationColumns(text.slice(open + 1, close)),
      indexes: [],
      sources: [source],
    });
  }
  for (const match of text.matchAll(
    /create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?"?([A-Za-z0-9_]+)"?\s+on\s+"?([A-Za-z0-9_]+)"?\s*\(([^)]*)\)/gi,
  )) {
    const table = tables.find((entry) => entry.name === match[3]);
    if (!table) continue;
    const columns = (match[4] ?? "")
      .split(",")
      .map((column) => column.trim().replace(/"/g, ""))
      .filter(Boolean);
    table.indexes.push({ name: match[2] ?? "", columns, unique: Boolean(match[1]) });
  }
  for (const match of text.matchAll(
    /alter\s+table\s+"?([A-Za-z0-9_]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([A-Za-z0-9_]+)"?\s+([^;]+)/gi,
  )) {
    const table = tables.find((entry) => entry.name === match[1]);
    const columnName = match[2];
    const definition = match[3];
    if (!table || !columnName || !definition) continue;
    const type = /^([A-Za-z][A-Za-z0-9_]*(?:\s*\([^)]*\))?)/.exec(definition.trim())?.[1] ?? "unknown";
    const defaultMatch = /\bdefault\s+([\s\S]+?)(?=\s+(?:references|check|unique|primary|not)\b|$)/i.exec(definition);
    const reference = /\breferences\s+"?([A-Za-z0-9_]+)"?\s*\(\s*"?([A-Za-z0-9_]+)"?\s*\)/i.exec(definition);
    table.columns.push({
      name: columnName,
      type,
      notNull: /\bnot\s+null\b/i.test(definition),
      primaryKey: /\bprimary\s+key\b/i.test(definition),
      unique: /\bunique\b/i.test(definition),
      default: defaultMatch?.[1]?.trim() ?? null,
      references: reference?.[1] && reference[2] ? `${reference[1]}.${reference[2]}` : null,
    });
  }
  return tables;
}

/** Merged Drizzle + migration schema, sorted by table name. */
export async function collectDbSchema(root: string): Promise<SchemaTable[]> {
  const index = fileIndex(root);
  const schemaSources = (
    await Promise.all([index.files("apps/server/features/*/schema.ts"), index.files("apps/server/infra/**/schema.ts")])
  )
    .flat()
    .sort();
  const texts = await Promise.all(schemaSources.map((file) => index.text(file)));

  const tableExports = new Map<string, string>();
  for (const text of texts) {
    for (const match of text.matchAll(/export\s+const\s+([A-Za-z0-9_]+)\s*=\s*pgTable\s*\(\s*["']([^"']+)["']/g)) {
      if (match[1] && match[2]) tableExports.set(match[1], match[2]);
    }
  }

  const merged = new Map<string, SchemaTable>();
  for (const [index, text] of texts.entries()) {
    const source = schemaSources[index] ?? "schema.ts";
    for (const table of parseDrizzleFile(text, source, tableExports)) merged.set(table.name, table);
  }

  const migrationFiles = await index.files("apps/server/database/migrations/*.ts");
  for (const file of migrationFiles) {
    const source = file;
    for (const table of parseMigrationFile(await index.text(file), source)) {
      const existing = merged.get(table.name);
      if (!existing) {
        merged.set(table.name, table);
        continue;
      }
      for (const column of table.columns) {
        if (!existing.columns.some((entry) => entry.name === column.name)) existing.columns.push(column);
      }
      for (const index of table.indexes) {
        if (!existing.indexes.some((entry) => entry.name === index.name)) existing.indexes.push(index);
      }
      if (!existing.sources.includes(source)) existing.sources.push(source);
    }
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** One readable block per table; used by the MCP `db-schema` tool. */
export function formatDbSchema(tables: readonly SchemaTable[], filter?: string): string {
  const wanted = filter?.trim().toLowerCase();
  const filtered = wanted ? tables.filter((table) => table.name.toLowerCase().includes(wanted)) : tables;
  if (filtered.length === 0) return filter ? `No table matches "${filter}".` : "No tables found.";
  const lines = [`${filtered.length} table(s)`, ""];
  for (const table of filtered) {
    lines.push(`${table.name} (${table.sources.join(" + ")})`);
    for (const column of table.columns) {
      const flags = [
        column.primaryKey ? "primary key" : "",
        column.notNull ? "not null" : "",
        column.unique ? "unique" : "",
        column.default ? `default ${column.default}` : "",
        column.references ? `references ${column.references}` : "",
      ].filter(Boolean);
      lines.push(`  ${column.name.padEnd(24)} ${column.type.padEnd(16)} ${flags.join(" ")}`.trimEnd());
    }
    for (const index of table.indexes) {
      lines.push(`  index ${index.name}${index.unique ? " unique" : ""} (${index.columns.join(", ")})`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
