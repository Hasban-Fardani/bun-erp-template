import { createUuid } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import type { Database } from "../../database/index.ts";
import { rowsOf } from "../../database/migrate.ts";
import type { Logger } from "../observability/logger.ts";
import { enqueueJob, requeueDeadJob } from "./queue.ts";
import type { JobBatchStatus, JobPayload } from "./schema.ts";

export type { JobBatchItemStatus, JobBatchStatus } from "./schema.ts";

/**
 * Batches extend the durable queue: `createJobBatch` stores the items and enqueues one runner job,
 * the runner processes chunks and writes progress back to the batch row, so a crash resumes from
 * the database instead of from memory. Item handlers must be idempotent: a crashed run can deliver
 * an item again after `resumeJobBatch` re-arms it.
 */

/** The one job name the composition root registers; a batch's own handler is resolved by `name`. */
export const BATCH_JOB_NAME = "batch.process";

const NAME_PATTERN = /^[a-z][a-z0-9_.-]{1,119}$/;
const DEFAULT_CHUNK_SIZE = 100;
const MAX_CHUNK_SIZE = 1_000;
const MAX_ITEMS = 100_000;
const MAX_ITEM_KEY_LENGTH = 200;
const ITEMS_PER_INSERT = 500;

export type JobBatchItemInput = {
  /** Stable caller-side identity, unique within the batch; e.g. a source row number. */
  key: string;
  payload?: JobPayload;
};

export type CreateJobBatchInput = {
  /** Handler name registered in the `BatchHandlerRegistry` at the composition root. */
  name: string;
  items: readonly JobBatchItemInput[];
  queue?: string;
  chunkSize?: number;
  maxAttempts?: number;
  runAt?: Date;
  /** Same key + same name returns the existing batch instead of creating a second one. */
  idempotencyKey?: string;
  metadata?: JobPayload;
};

export type JobBatchProgress = {
  id: string;
  name: string;
  queue: string;
  status: JobBatchStatus;
  total: number;
  processed: number;
  failed: number;
  /** Items still waiting or interrupted; `total - processed` unless a resume re-armed items. */
  pending: number;
  chunkSize: number;
  metadata: JobPayload;
  jobId: string | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  cancelledAt: Date | null;
};

export type BatchHandlerContext = { db: Database; batchId: string; itemKey: string; attempt: number };
export type BatchItemHandler = (payload: JobPayload, context: BatchHandlerContext) => Promise<void>;
export type BatchCompletionHandler = (progress: JobBatchProgress, context: { db: Database }) => Promise<void>;

type BatchHandlerEntry = { handle: BatchItemHandler; onComplete?: BatchCompletionHandler };

/** Handler lookup for `batch.process`; features register by stable name at the composition root. */
export class BatchHandlerRegistry {
  readonly #handlers = new Map<string, BatchHandlerEntry>();

  register(name: string, handle: BatchItemHandler, options: { onComplete?: BatchCompletionHandler } = {}): void {
    if (!NAME_PATTERN.test(name)) throw new Error("Batch names must be stable lowercase identifiers");
    if (this.#handlers.has(name)) throw new Error(`Batch handler already registered: ${name}`);
    if (typeof handle !== "function") throw new TypeError("Batch handler must be a function");
    this.#handlers.set(name, { handle, ...(options.onComplete ? { onComplete: options.onComplete } : {}) });
  }

  get(name: string): BatchItemHandler | undefined {
    return this.#handlers.get(name)?.handle;
  }

  completion(name: string): BatchCompletionHandler | undefined {
    return this.#handlers.get(name)?.onComplete;
  }
}

const BATCH_COLUMNS = sql`
  id, batch_name as name, queue_name as queue, status, total, processed, failed,
  chunk_size as "chunkSize", metadata, job_id as "jobId", last_error_code as "lastErrorCode",
  created_at as "createdAt", updated_at as "updatedAt", finished_at as "finishedAt",
  cancelled_at as "cancelledAt"
`;

/** Creates the batch, its items and its runner job in one transaction. */
export async function createJobBatch(
  db: Database,
  input: CreateJobBatchInput,
): Promise<{ batchId: string; jobId: string }> {
  const name = input.name.trim();
  const queue = input.queue?.trim() || "default";
  const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  const metadata = input.metadata ?? {};
  if (!NAME_PATTERN.test(name)) throw new Error("Batch name must be a stable lowercase identifier");
  if (!NAME_PATTERN.test(queue)) throw new Error("Queue name must be a stable lowercase identifier");
  if (input.items.length === 0) throw new RangeError("A batch needs at least one item");
  if (input.items.length > MAX_ITEMS) throw new RangeError(`A batch supports at most ${MAX_ITEMS} items`);
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
    throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_CHUNK_SIZE}`);
  }
  if (idempotencyKey && idempotencyKey.length > MAX_ITEM_KEY_LENGTH) {
    throw new RangeError(`idempotencyKey must not exceed ${MAX_ITEM_KEY_LENGTH} characters`);
  }
  const keys = new Set<string>();
  for (const item of input.items) {
    const key = item.key.trim();
    if (key.length === 0 || key.length > MAX_ITEM_KEY_LENGTH) {
      throw new RangeError(`Item keys must be 1–${MAX_ITEM_KEY_LENGTH} characters`);
    }
    if (keys.has(key)) throw new Error(`Duplicate item key in batch: ${key}`);
    keys.add(key);
  }

  return db.transaction(async (tx) => {
    const batchId = createUuid();
    const maxAttempts = input.maxAttempts ?? 5;
    const inserted = rowsOf<{ id: string }>(
      await tx.execute(sql`
        insert into job_batches (id, batch_name, queue_name, status, total, chunk_size, max_attempts, metadata, idempotency_key)
        values (${batchId}, ${name}, ${queue}, 'pending', ${input.items.length}, ${chunkSize}, ${maxAttempts},
          ${JSON.stringify(metadata)}::jsonb, ${idempotencyKey})
        on conflict (batch_name, idempotency_key) do nothing
        returning id
      `),
    );
    if (!inserted[0]) {
      // Only a repeated idempotency key can conflict; return the batch the first caller created.
      const existing = rowsOf<{ id: string; jobId: string | null }>(
        await tx.execute(sql`
          select id, job_id as "jobId" from job_batches
          where batch_name = ${name} and idempotency_key = ${idempotencyKey}
        `),
      )[0];
      if (!existing) throw new Error("Batch insert did not return an identifier");
      if (existing.jobId) return { batchId: existing.id, jobId: existing.jobId };
      const jobId = await enqueueBatchJob(tx as unknown as Database, {
        batchId: existing.id,
        queue,
        maxAttempts: input.maxAttempts,
        runAt: input.runAt,
      });
      await tx.execute(sql`update job_batches set job_id = ${jobId}, updated_at = now() where id = ${existing.id}`);
      return { batchId: existing.id, jobId };
    }

    for (let offset = 0; offset < input.items.length; offset += ITEMS_PER_INSERT) {
      const slice = input.items.slice(offset, offset + ITEMS_PER_INSERT);
      const values = slice.map(
        (item, index) =>
          sql`(${createUuid()}, ${batchId}, ${offset + index}, ${item.key.trim()}, ${JSON.stringify(item.payload ?? {})}::jsonb)`,
      );
      await tx.execute(sql`
        insert into job_batch_items (id, batch_id, position, item_key, payload)
        values ${sql.join(values, sql`, `)}
      `);
    }

    const jobId = await enqueueBatchJob(tx as unknown as Database, {
      batchId,
      queue,
      maxAttempts: input.maxAttempts,
      runAt: input.runAt,
    });
    await tx.execute(sql`update job_batches set job_id = ${jobId}, updated_at = now() where id = ${batchId}`);
    return { batchId, jobId };
  });
}

function enqueueBatchJob(
  db: Database,
  input: { batchId: string; queue: string; maxAttempts?: number; runAt?: Date; idempotencyKey?: string },
): Promise<string> {
  return enqueueJob(db, {
    name: BATCH_JOB_NAME,
    queue: input.queue,
    payload: { batchId: input.batchId },
    idempotencyKey: input.idempotencyKey ?? `batch:${input.batchId}`,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
    ...(input.runAt ? { runAt: input.runAt } : {}),
  });
}

export async function getJobBatch(db: Database, batchId: string): Promise<JobBatchProgress | null> {
  const row = rowsOf<JobBatchProgress>(
    await db.execute(sql`select ${BATCH_COLUMNS} from job_batches where id = ${batchId}`),
  )[0];
  return row ? withPending(row) : null;
}

/** Stops the run at the next chunk boundary; already-claimed items finish, the rest stay pending. */
export async function cancelJobBatch(db: Database, batchId: string): Promise<boolean> {
  const rows = rowsOf<{ jobId: string | null }>(
    await db.execute(sql`
      update job_batches set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = ${batchId} and status in ('pending', 'running')
      returning job_id as "jobId"
    `),
  );
  const jobId = rows[0]?.jobId;
  if (!jobId) return false;
  // A queued runner has nothing to do for a cancelled batch; a running one observes the flag.
  await db.execute(sql`delete from background_jobs where id = ${jobId} and status = 'pending'`);
  return true;
}

/**
 * Continues a cancelled or interrupted batch: re-arms items a crashed worker left `running`,
 * recomputes the counters and re-enqueues the runner when it is no longer waiting. Failed items
 * stay failed so the report keeps them; a resume never hides work that already failed.
 */
export async function resumeJobBatch(db: Database, batchId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const batch = rowsOf<{ status: JobBatchStatus; jobId: string | null; queue: string; maxAttempts: number }>(
      await tx.execute(sql`
        select status, job_id as "jobId", queue_name as queue, max_attempts as "maxAttempts"
        from job_batches where id = ${batchId} for update
      `),
    )[0];
    if (!batch || batch.status === "completed") return false;
    if (batch.jobId) {
      const job = rowsOf<{ status: string; alive: boolean }>(
        await tx.execute(sql`
          select status, (status = 'running' and lease_expires_at > now()) as alive
          from background_jobs where id = ${batch.jobId}
        `),
      )[0];
      // A live worker owns this batch; re-arming its items would process them twice.
      if (job?.status === "running" && job.alive) return false;
    }

    await tx.execute(sql`
      update job_batch_items set status = 'pending', updated_at = now()
      where batch_id = ${batchId} and status = 'running'
    `);
    await tx.execute(sql`
      update job_batches set
        status = 'running',
        processed = (select count(*) from job_batch_items where batch_id = ${batchId} and status in ('completed', 'failed')),
        failed = (select count(*) from job_batch_items where batch_id = ${batchId} and status = 'failed'),
        cancelled_at = null, last_error_code = null, updated_at = now()
      where id = ${batchId}
    `);

    let queued = false;
    if (batch.jobId) {
      const job = rowsOf<{ status: string }>(
        await tx.execute(sql`select status from background_jobs where id = ${batch.jobId}`),
      )[0];
      if (job?.status === "pending") {
        queued = true;
      } else if (job?.status === "dead") {
        queued = await requeueDeadJob(tx as unknown as Database, batch.jobId);
      }
    }
    if (!queued) {
      // A fresh key: the completed or deleted runner still holds `batch:<batchId>` and would win
      // the idempotency conflict, silently pointing the batch at a job that will never run again.
      const jobId = await enqueueBatchJob(tx as unknown as Database, {
        batchId,
        queue: batch.queue,
        maxAttempts: batch.maxAttempts,
        idempotencyKey: `batch:${batchId}:${createUuid()}`,
      });
      await tx.execute(sql`update job_batches set job_id = ${jobId}, updated_at = now() where id = ${batchId}`);
    }
    return true;
  });
}

/**
 * The runner body: claims chunks, invokes the registered handler per item and settles each item
 * with its counter update in one statement. Item failures are recorded and do not stop the batch;
 * only a missing handler fails the batch itself. Call it from the `batch.process` job handler.
 */
export async function processJobBatch(
  db: Database,
  batchId: string,
  handlers: BatchHandlerRegistry,
  logger: Logger,
): Promise<JobBatchProgress> {
  const batch = await getJobBatch(db, batchId);
  if (!batch) throw namedError("BATCH_NOT_FOUND", "Batch not found");
  if (isTerminal(batch.status)) return batch;

  const handler = handlers.get(batch.name);
  if (!handler) {
    await db.execute(sql`
      update job_batches set status = 'failed', last_error_code = 'BATCH_HANDLER_NOT_REGISTERED',
        finished_at = now(), updated_at = now()
      where id = ${batchId} and status in ('pending', 'running')
    `);
    logger.error({ event: "batch.handler_missing", batchId, batchName: batch.name });
    return (await getJobBatch(db, batchId)) ?? batch;
  }

  await db.execute(sql`
    update job_batches set status = 'running', updated_at = now()
    where id = ${batchId} and status = 'pending'
  `);

  for (;;) {
    const current = await getJobBatch(db, batchId);
    if (!current || isTerminal(current.status)) return current ?? batch;
    const chunk = await claimBatchItems(db, batchId, current.chunkSize);
    if (chunk.length === 0) break;
    for (const item of chunk) {
      if (await isBatchCancelled(db, batchId)) return (await getJobBatch(db, batchId)) ?? current;
      try {
        await handler(item.payload, { db, batchId, itemKey: item.itemKey, attempt: item.attemptCount });
        await settleBatchItem(db, batchId, item.id, "completed", null);
      } catch (error) {
        const code = batchErrorCode(error);
        await settleBatchItem(db, batchId, item.id, "failed", code);
        logger.warn({ event: "batch.item_failed", batchId, itemKey: item.itemKey, errorCode: code });
      }
    }
  }

  const finished = await completeBatch(db, batchId);
  const progress = (await getJobBatch(db, batchId)) ?? batch;
  if (finished) {
    logger.info({
      event: "batch.completed",
      batchId,
      batchName: progress.name,
      total: progress.total,
      failed: progress.failed,
    });
    const onComplete = handlers.completion(progress.name);
    if (onComplete) {
      try {
        await onComplete(progress, { db });
      } catch (error) {
        logger.error({ event: "batch.completion_failed", batchId, errorCode: batchErrorCode(error) });
      }
    }
  }
  return progress;
}

type ClaimedBatchItem = { id: string; position: number; itemKey: string; payload: JobPayload; attemptCount: number };

async function claimBatchItems(db: Database, batchId: string, chunkSize: number): Promise<ClaimedBatchItem[]> {
  const claimed = rowsOf<ClaimedBatchItem>(
    await db.execute(sql`
      update job_batch_items
      set status = 'running', attempt_count = attempt_count + 1, updated_at = now()
      where id in (
        select id from job_batch_items
        where batch_id = ${batchId} and status = 'pending'
        order by position asc
        limit ${chunkSize}
        for update skip locked
      )
      returning id, position, item_key as "itemKey", payload, attempt_count as "attemptCount"
    `),
  );
  // UPDATE ... RETURNING does not promise row order; the caller sees insertion order.
  return claimed.sort((a, b) => a.position - b.position);
}

/** Item transition and its counter update are one statement, so progress can never drift. */
async function settleBatchItem(
  db: Database,
  batchId: string,
  itemId: string,
  status: "completed" | "failed",
  errorCode: string | null,
): Promise<boolean> {
  const failedDelta = status === "failed" ? 1 : 0;
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      with settled as (
        update job_batch_items
        set status = ${status}, last_error_code = ${errorCode}, processed_at = now(), updated_at = now()
        where id = ${itemId} and batch_id = ${batchId} and status = 'running'
        returning id
      )
      update job_batches
      set processed = processed + 1, failed = failed + ${failedDelta}, updated_at = now()
      where id = ${batchId} and exists (select 1 from settled)
      returning id
    `),
  );
  return rows.length === 1;
}

async function completeBatch(db: Database, batchId: string): Promise<boolean> {
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      update job_batches
      set status = 'completed', finished_at = now(), updated_at = now()
      where id = ${batchId} and status = 'running'
        and not exists (
          select 1 from job_batch_items where batch_id = ${batchId} and status in ('pending', 'running')
        )
      returning id
    `),
  );
  return rows.length === 1;
}

async function isBatchCancelled(db: Database, batchId: string): Promise<boolean> {
  const row = rowsOf<{ cancelled: boolean }>(
    await db.execute(sql`select (status = 'cancelled') as cancelled from job_batches where id = ${batchId}`),
  )[0];
  return row?.cancelled === true;
}

function withPending(row: JobBatchProgress): JobBatchProgress {
  return { ...row, pending: Math.max(0, row.total - row.processed) };
}

function isTerminal(status: JobBatchStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function batchErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    if (/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return code;
    const name = "name" in error && typeof error.name === "string" ? error.name : "";
    if (/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) return name;
  }
  return "BATCH_ITEM_FAILED";
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}
