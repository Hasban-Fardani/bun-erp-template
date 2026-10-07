import { type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as z from "zod";
import type { Database } from "../../database/index.ts";

/**
 * List query contract shared by every collection endpoint: `?page=2&perPage=25&sort=name&dir=desc`.
 * `sort` is validated against a per-module allowlist, so an unknown column is a 422 rather
 * than a silently ignored parameter — and it can never reach SQL as user input.
 */
export type SortDirection = "asc" | "desc";

export function listQueryParts<S extends readonly [string, ...string[]]>(config: {
  sortable: S;
  defaultSort: S[number];
  defaultDir?: SortDirection;
}) {
  return {
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
    sort: z.enum(config.sortable).default(config.defaultSort),
    dir: z.enum(["asc", "desc"]).default(config.defaultDir ?? "asc"),
  };
}

export type ListQuery = {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
};

/** Pagination fields in the documented response shape; spread next to the module's `items`. */
export const listMetaSchemaProperties = {
  page: { type: "integer" },
  perPage: { type: "integer" },
  total: { type: "integer" },
  totalPages: { type: "integer" },
} as const;

/** Translates the 1-based page contract into the offset the database wants. */
export function toOffset(input: { page: number; perPage: number }): { limit: number; offset: number } {
  return { limit: input.perPage, offset: (input.page - 1) * input.perPage };
}

/**
 * Escapes LIKE metacharacters so a user's `%` or `_` matches the literal character instead of
 * acting as a wildcard. Postgres treats backslash as the default escape, so no `escape` clause is
 * needed: pair it with `ilike(column, `%${escapeLikePattern(search)}%`)`.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * The one `count(*)` projection collection services share. The same filter expression as the items
 * query keeps the reported total consistent with the rows a client can page through.
 */
export function countRows(db: Database, table: PgTable, where?: SQL) {
  return db.select({ total: sql<number>`count(*)::int` }).from(table).where(where);
}

/**
 * Envelope for every collection response. `totalPages` is derived here so no client has to
 * repeat the ceiling arithmetic, and an empty result still reports 1 page rather than 0.
 */
export function listMeta(
  input: ListQuery,
  total: number,
): {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
} {
  return {
    page: input.page,
    perPage: input.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.perPage)),
  };
}
