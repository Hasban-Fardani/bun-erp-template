import { sql } from "drizzle-orm";
import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/index.ts";

/**
 * Spatie-style RBAC: permission = static statements from code, role = dynamic in the DB.
 * Code must not depend on a role an admin can delete, and vice versa.
 * The default server is single-tenant: roles and assignments are global. Tenant scoping belongs
 * to the opt-in `organizations` feature, not to RBAC (Q28).
 */
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

/** A user holds each role at most once; that is what makes assign idempotent. */
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("user_roles_user_idx").on(table.userId),
    uniqueIndex("user_roles_unique_idx").on(table.userId, table.roleId),
  ],
);
