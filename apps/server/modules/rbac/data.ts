import { sql } from "drizzle-orm";
import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "../../platform/database/schema.ts";
import { users } from "../identity/data.ts";

/**
 * RBAC model spatie/laravel-permission (PRD §RBAC).
 *
 * `permissions` = statemen statis (ditulis di kode, di-seed). `roles` = kumpulan izin
 * yang diubah runtime. Pemisahan itu disengaja: kode tidak boleh bergantung pada role
 * yang bisa dihapus admin, dan admin tidak boleh mengarang permission yang tidak
 * dipahami kode.
 */
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("roles_organization_key_idx").on(table.organizationId, table.key)],
);

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

/**
 * Penugasan berlingkup. `scopeType`/`scopeId` kosong = role berlaku di seluruh
 * organisasi. Terisi = hanya pada satu lingkup (mis. satu departemen).
 *
 * Departemen karena itu opsional: user tanpa departemen tetap bisa memegang role
 * global. Itu alasan `department_id` tidak pernah menjadi kolom di tabel user.
 */
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
    scopeType: text("scope_type"),
    scopeId: uuid("scope_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("user_roles_user_idx").on(table.userId),
    uniqueIndex("user_roles_unique_idx").on(
      table.userId,
      table.roleId,
      sql`coalesce(${table.scopeType}, '')`,
      sql`coalesce(${table.scopeId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
  ],
);
