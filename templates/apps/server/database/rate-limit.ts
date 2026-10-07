import { bigint, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Better Auth `rateLimit.storage: "database"` store. One row per bucket key; `last_request` is
 * epoch milliseconds. Migration 0011 creates the table; the `id` primary key and unique `key` are
 * Better Auth 1.7.5's adapter contract for every model it writes.
 *
 * Declared at the database layer (like `numbering.ts`) so `identity/auth.ts` keeps the literal
 * `schema:` map line that `cli/lib/infra-wiring.ts` anchors the organizations installer on.
 */
export const rateLimits = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
