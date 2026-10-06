import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { timestamp } from "drizzle-orm/pg-core";
import type { Database } from "./index.ts";

/**
 * `deleted_at timestamptz` column. Null means live; every default read applies `notDeleted(table)`
 * so a deleted row only appears when a service explicitly asks for it.
 */
// slop-ok: deliberate DSL column helper; features import this name, not the timestamp builder
export function softDelete() {
  return timestamp("deleted_at", { withTimezone: true });
}

type SoftDeletable = { id: PgColumn; deletedAt: PgColumn };
type SoftDeletableTable = PgTable & SoftDeletable & { $inferInsert: { deletedAt?: Date | null } };

// slop-ok: deliberate DSL filter helper; every default read composes this predicate
export function notDeleted(table: SoftDeletable): SQL {
  return isNull(table.deletedAt);
}

/** Marks one live row deleted. Returns the row, or undefined when absent or already deleted. */
export async function softDeleteRow<T extends SoftDeletableTable>(
  db: Database,
  table: T,
  id: string,
): Promise<T["$inferSelect"] | undefined> {
  const patch: PgUpdateSetSource<T> = { deletedAt: new Date() };
  const rows = await db
    .update(table)
    .set(patch)
    .where(and(eq(table.id, id), notDeleted(table)))
    .returning();
  return rows[0];
}

/** Clears `deleted_at`. Returns the row, or undefined when the row is absent. */
export async function restoreRow<T extends SoftDeletableTable>(
  db: Database,
  table: T,
  id: string,
): Promise<T["$inferSelect"] | undefined> {
  const patch: PgUpdateSetSource<T> = { deletedAt: null };
  const rows = await db.update(table).set(patch).where(eq(table.id, id)).returning();
  return rows[0];
}

/** Hard-deletes one row, live or deleted. Returns the row, or undefined when absent. */
export async function forceDeleteRow<T extends SoftDeletableTable>(
  db: Database,
  table: T,
  id: string,
): Promise<T["$inferSelect"] | undefined> {
  const rows = await db.delete(table).where(eq(table.id, id)).returning();
  return rows[0];
}
