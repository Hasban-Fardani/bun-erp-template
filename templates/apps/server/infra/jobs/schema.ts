import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export type JobStatus = "pending" | "running" | "completed" | "dead";
export type JobPayload = Readonly<Record<string, unknown>>;
export type JobBatchStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type JobBatchItemStatus = "pending" | "running" | "completed" | "failed";

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

/**
 * One bulk operation. The item rows are the work; this row carries the chunk size, the progress
 * counters and the cancel flag the runner reads. `name` points at a handler registered in code.
 */
// slop-ok: exported schema declarations; the batch engine reads the tables through raw SQL.
export const jobBatches = pgTable(
  "job_batches",
  {
    id: text("id").primaryKey(),
    name: text("batch_name").notNull(),
    queue: text("queue_name").notNull().default("default"),
    status: text("status").$type<JobBatchStatus>().notNull().default("pending"),
    total: integer("total").notNull(),
    processed: integer("processed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    chunkSize: integer("chunk_size").notNull().default(100),
    maxAttempts: integer("max_attempts").notNull().default(5),
    metadata: jsonb("metadata").$type<JobPayload>().notNull().default(sql`'{}'::jsonb`),
    jobId: text("job_id"),
    idempotencyKey: text("idempotency_key"),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("job_batches_idempotency_idx").on(table.name, table.idempotencyKey),
    index("job_batches_status_idx").on(table.status, table.createdAt),
  ],
);

/** One unit of batch work; a crashed runner leaves `running` rows that `resumeJobBatch` re-arms. */
export const jobBatchItems = pgTable(
  "job_batch_items",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id").notNull(),
    /** Insertion order within the batch; the runner claims in this order. */
    position: integer("position").notNull(),
    itemKey: text("item_key").notNull(),
    payload: jsonb("payload").$type<JobPayload>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").$type<JobBatchItemStatus>().notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("job_batch_items_key_idx").on(table.batchId, table.itemKey),
    index("job_batch_items_status_idx").on(table.batchId, table.status, table.position),
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
