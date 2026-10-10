import { expect, test } from "bun:test";
import { createUuid } from "@loom/utils";
import { sql } from "drizzle-orm";
import { rowsOf } from "@/database/rows.ts";
import {
  BATCH_JOB_NAME,
  BatchHandlerRegistry,
  cancelJobBatch,
  createJobBatch,
  getJobBatch,
  processJobBatch,
  resumeJobBatch,
} from "@/infra/jobs/batch.ts";
import { claimNextJob, runNextJob } from "@/infra/jobs/queue.ts";
import { JobRegistry } from "@/infra/jobs/registry.ts";
import { createTestContext } from "../../support/fixtures.ts";
import { silentLogger as logger } from "../../support/jobs.ts";

function itemsOf(count: number) {
  return Array.from({ length: count }, (_, index) => ({ key: `row-${index + 1}`, payload: { value: index + 1 } }));
}

test("a batch processes every item in chunks and reports progress", async () => {
  const { db } = await createTestContext();
  const seen: string[] = [];
  const handlers = new BatchHandlerRegistry();
  handlers.register("test.batch", async (payload, context) => {
    seen.push(`${context.itemKey}:${String(payload.value)}`);
  });

  const { batchId } = await createJobBatch(db, {
    name: "test.batch",
    items: itemsOf(7),
    chunkSize: 3,
  });
  const progress = await processJobBatch(db, batchId, handlers, logger);

  expect(progress).toMatchObject({ status: "completed", total: 7, processed: 7, failed: 0, pending: 0 });
  expect(seen).toHaveLength(7);
  expect(seen[0]).toBe("row-1:1");
  expect(seen[6]).toBe("row-7:7");
  const stored = await getJobBatch(db, batchId);
  expect(stored?.status).toBe("completed");
  expect(stored?.finishedAt).toBeTruthy();
});

test("an item failure is recorded with its code and does not stop the rest", async () => {
  const { db } = await createTestContext();
  const handled: string[] = [];
  const handlers = new BatchHandlerRegistry();
  handlers.register("test.partial", async (_payload, context) => {
    if (context.itemKey === "row-2") {
      const error = new Error("row rejected");
      error.name = "TEST_ROW_REJECTED";
      throw error;
    }
    handled.push(context.itemKey);
  });

  const { batchId } = await createJobBatch(db, { name: "test.partial", items: itemsOf(4) });
  const progress = await processJobBatch(db, batchId, handlers, logger);

  expect(progress).toMatchObject({ status: "completed", total: 4, processed: 4, failed: 1, pending: 0 });
  expect(handled).toEqual(["row-1", "row-3", "row-4"]);
  const failed = rowsOf<{ itemKey: string; lastErrorCode: string | null; attemptCount: number }>(
    await db.execute(sql`
      select item_key as "itemKey", last_error_code as "lastErrorCode", attempt_count as "attemptCount"
      from job_batch_items where batch_id = ${batchId} and status = 'failed'
    `),
  );
  expect(failed).toEqual([{ itemKey: "row-2", lastErrorCode: "TEST_ROW_REJECTED", attemptCount: 1 }]);
});

test("cancel stops at the next item and resume continues the remaining work", async () => {
  // slop-ok: the registry setup is deliberately the same shape as the partial-failure test
  const { db } = await createTestContext();
  const handled: string[] = [];
  const handlers = new BatchHandlerRegistry();
  handlers.register("test.cancel", async (_payload, context) => {
    handled.push(context.itemKey);
    if (context.itemKey === "row-1") await cancelJobBatch(context.db, context.batchId);
  });

  const { batchId } = await createJobBatch(db, { name: "test.cancel", items: itemsOf(5), chunkSize: 2 });
  const cancelled = await processJobBatch(db, batchId, handlers, logger);
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.processed).toBe(1);
  expect(handled).toEqual(["row-1"]);

  expect(await resumeJobBatch(db, batchId)).toBe(true);
  const resumed = await processJobBatch(db, batchId, handlers, logger);
  expect(resumed).toMatchObject({ status: "completed", processed: 5, failed: 0, pending: 0 });
  expect(handled).toEqual(["row-1", "row-2", "row-3", "row-4", "row-5"]);
  expect(await resumeJobBatch(db, batchId)).toBe(false);
});

test("a dead runner job is requeued by resume and the durable queue drains the batch", async () => {
  const { db } = await createTestContext();
  const queue = `tests-${createUuid()}`;
  const handled: string[] = [];
  const handlers = new BatchHandlerRegistry();
  handlers.register("test.queue", async (_payload, context) => {
    handled.push(context.itemKey);
  });
  const registry = new JobRegistry();
  registry.register(BATCH_JOB_NAME, async (payload, context) => {
    await processJobBatch(context.db, String(payload.batchId), handlers, logger);
  });

  const { batchId, jobId } = await createJobBatch(db, { name: "test.queue", items: itemsOf(3), queue });
  // Simulate a crashed worker: the runner job dies before doing any work.
  await db.execute(sql`
    update background_jobs set status = 'dead', attempt_count = max_attempts,
      last_error_code = 'JOB_HANDLER_FAILED', lease_token = null, lease_expires_at = null
    where id = ${jobId}
  `);
  expect(await resumeJobBatch(db, batchId)).toBe(true);
  expect(await runNextJob(db, registry, logger, { queue })).toBe(true);

  const progress = await getJobBatch(db, batchId);
  expect(progress).toMatchObject({ status: "completed", processed: 3, failed: 0 });
  expect(handled).toEqual(["row-1", "row-2", "row-3"]);
  const runner = rowsOf<{ status: string }>(
    await db.execute(sql`select status from background_jobs where id = ${jobId}`),
  );
  expect(runner[0]?.status).toBe("completed");
});

test("resume refuses while a live worker holds the runner job", async () => {
  const { db } = await createTestContext();
  const queue = `tests-${createUuid()}`;
  const { batchId } = await createJobBatch(db, { name: "test.live", items: itemsOf(2), queue });
  expect(await claimNextJob(db, queue)).toMatchObject({ name: BATCH_JOB_NAME });
  expect(await resumeJobBatch(db, batchId)).toBe(false);
});

test("a repeated idempotency key returns the same batch and runner", async () => {
  const { db } = await createTestContext();
  const input = { name: "test.idempotent", items: itemsOf(2), idempotencyKey: "request-1" };
  const first = await createJobBatch(db, input);
  const second = await createJobBatch(db, input);
  expect(second).toEqual(first);
  const count = rowsOf<{ total: number }>(
    await db.execute(sql`select count(*)::int as total from job_batches where id = ${first.batchId}`),
  );
  expect(count[0]?.total).toBe(1);
});
