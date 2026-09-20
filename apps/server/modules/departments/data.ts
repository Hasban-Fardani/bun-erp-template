import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "../../platform/database/schema.ts";

/**
 * Reference module (PRD §6): pola yang ditiru generator. Tabel bisnis selalu membawa
 * organization_id + kolom audit dasar.
 */
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    code: text("code").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("departments_organization_code_idx").on(table.organizationId, table.code),
    index("departments_organization_name_idx").on(table.organizationId, table.name),
  ],
);
