import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "../../platform/database/schema.ts";

/** Jejak audit, append-only. `actor_id` tanpa FK: hapus user tak boleh hapus bukti. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id").references(() => organizations.id),
    actorId: uuid("actor_id"),
    actorLabel: text("actor_label").notNull().default(""),
    /** `domain.aksi_hasil`, mis. `user.role_assigned`. */
    event: text("event").notNull(),
    subjectType: text("subject_type").notNull().default(""),
    subjectId: text("subject_id").notNull().default(""),
    before: jsonb("before"),
    after: jsonb("after"),
    /** requestId dari envelope — satu kejadian bisa dilacak sampai ke log server. */
    traceId: text("trace_id").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_organization_created_idx").on(table.organizationId, table.createdAt),
    index("audit_logs_event_idx").on(table.event),
    index("audit_logs_subject_idx").on(table.subjectType, table.subjectId),
  ],
);
