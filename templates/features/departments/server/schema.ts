import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Reference module (PRD §6): the pattern the generator copies. Business tables carry the base
 * audit columns; tenant scoping belongs to the opt-in organizations feature, not here.
 */
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    name: text("name").notNull(),
    code: text("code").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("departments_code_idx").on(table.code), index("departments_name_idx").on(table.name)],
);
