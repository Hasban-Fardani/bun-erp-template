import { asc, desc, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

/**
 * Builds the ORDER BY for a list query. The column is validated against the module's zod
 * allowlist before it gets here, so a miss means the allowlist and the table disagree —
 * a programming error worth a 500 rather than a silently unsorted page.
 *
 * The `id` tiebreaker is not decoration: without it, rows sharing a sort value can swap
 * places between requests, which makes page 2 repeat or skip rows from page 1.
 */
export function orderByColumn(table: PgTable, column: string, dir: "asc" | "desc"): SQL[] {
  const columns = table as unknown as Record<string, PgColumn | undefined>;
  const target = columns[column];
  if (!target) throw new Error(`Sort column "${column}" is not a column of this table`);

  const primary = dir === "desc" ? desc(target) : asc(target);
  const id = columns.id;
  return id ? [primary, asc(id)] : [primary];
}
