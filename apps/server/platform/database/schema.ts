import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tabel infrastruktur: setiap modul bisnis merujuk pemilik datanya.
 * Single-tenant default (satu baris), tetapi kolom `organization_id` ada sejak
 * migration pertama (ADR-0004) — menambahkannya belakangan = expand-contract mahal.
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
