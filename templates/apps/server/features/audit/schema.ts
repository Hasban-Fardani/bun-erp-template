import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Audit trail, append-only. `actor_id` without FK: deleting a user must not delete evidence. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    actorId: uuid("actor_id"),
    actorLabel: text("actor_label").notNull().default(""),
    /** `domain.action_result`, e.g. `user.role_assigned`. */
    event: text("event").notNull(),
    subjectType: text("subject_type").notNull().default(""),
    subjectId: text("subject_id").notNull().default(""),
    before: jsonb("before"),
    after: jsonb("after"),
    /** requestId from the envelope — an event can be traced to the server log. */
    /** Admin who acted AS `actorId` during an impersonation; no foreign key, like `actorId`. */
    impersonatorId: uuid("impersonator_id"),
    impersonatorLabel: text("impersonator_label").notNull().default(""),
    traceId: text("trace_id").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_event_idx").on(table.event),
    index("audit_logs_subject_idx").on(table.subjectType, table.subjectId),
  ],
);
