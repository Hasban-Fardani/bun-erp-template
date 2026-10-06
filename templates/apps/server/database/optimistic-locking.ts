import { and, eq, type SQL, sql } from "drizzle-orm";
import { integer, type PgColumn } from "drizzle-orm/pg-core";

/** `version integer not null default 0`; the row's optimistic-locking counter. */
export function version() {
  return integer("version").notNull().default(0);
}

/** WHERE clause that matches the row only while it is still at `expectedVersion`. */
export function versionGuard(table: { id: PgColumn; version: PgColumn }, id: string, expectedVersion: number): SQL {
  return and(eq(table.id, id), eq(table.version, expectedVersion)) as SQL;
}

/** SET fragment that bumps `version` in the same UPDATE statement as the data change. */
export function bumpVersion(table: { version: PgColumn }): SQL {
  return sql`${table.version} + 1`;
}
