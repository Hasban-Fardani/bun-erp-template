import { relations, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/index.ts";

/**
 * Better Auth organization-plugin tables. Property names follow the plugin contract verbatim: the
 * Drizzle adapter compares the adapter schema map against `getAuthTables()` and addresses columns
 * by property name, while the physical column name may stay snake_case. Teams are disabled, so the
 * plugin writes no team/team_member tables.
 *
 * `activeOrganizationId` is not here: it belongs to the core `session` table and the
 * `session-field` wiring operation adds it to `features/identity/schema.ts`.
 */
export const organizations = pgTable(
  "organization",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("organization_slug_idx").on(table.slug)],
);

export const members = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("member_organization_user_idx").on(table.organizationId, table.userId),
    index("member_organization_idx").on(table.organizationId),
    index("member_user_idx").on(table.userId),
  ],
);

export const invitations = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organization_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

/**
 * Relations the plugin's joins address through `db.query`. The drizzle adapter derives each
 * relation key from the Better Auth model name plus `s` (`member` -> `organizations`/`users`,
 * `organization` -> `members`/`invitations`), so the names are plural; renaming one breaks
 * `listOrganizations` and `findMemberByOrgId`.
 */
export const organizationRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(invitations),
}));

export const memberRelations = relations(members, ({ one }) => ({
  organizations: one(organizations, { fields: [members.organizationId], references: [organizations.id] }),
  users: one(users, { fields: [members.userId], references: [users.id] }),
}));

export const invitationRelations = relations(invitations, ({ one }) => ({
  organizations: one(organizations, { fields: [invitations.organizationId], references: [organizations.id] }),
}));
