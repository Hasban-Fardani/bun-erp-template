import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/index.ts";

/**
 * One row per recipient. The default database channel writes here; installed channels (mail)
 * fan out from the same notify() call. `read_at` is the read receipt the API filters and counts on.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    data: jsonb("data").$type<Record<string, unknown> | null>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_user_idx").on(table.userId, table.readAt, table.createdAt)],
);
