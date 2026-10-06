import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export type JobStatus = "pending" | "running" | "completed" | "dead";
export type JobPayload = Readonly<Record<string, unknown>>;

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: text("id").primaryKey(),
    name: text("job_name").notNull(),
    queue: text("queue_name").notNull().default("default"),
    payload: jsonb("payload").$type<JobPayload>().notNull(),
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("background_jobs_due_idx").on(table.queue, table.status, table.runAt),
    index("background_jobs_lease_idx").on(table.status, table.leaseExpiresAt),
    uniqueIndex("background_jobs_idempotency_idx").on(table.queue, table.name, table.idempotencyKey),
  ],
);

/** One row per declared schedule: the definition is code, this table is its runtime state. */
// slop-ok: exported schema declaration; the scheduler reads the table through raw SQL.
export const jobSchedules = pgTable(
  "job_schedules",
  {
    name: text("name").primaryKey(),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastStatus: text("last_status"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("job_schedules_due_idx").on(table.nextRunAt)],
);
