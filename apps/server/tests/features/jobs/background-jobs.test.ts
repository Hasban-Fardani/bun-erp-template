import { expect, test } from "bun:test";
import { createUuid } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import { rowsOf } from "../../../platform/database/migrate.ts";
import { claimNextJob, enqueueJob, requeueDeadJob, runNextJob } from "../../../platform/jobs/queue.ts";
import { JobRegistry } from "../../../platform/jobs/registry.ts";
import { startJobWorker } from "../../../platform/jobs/worker.ts";
import type { Logger } from "../../../platform/observability/logger.ts";
import { createTestContext } from "../../support/fixtures.ts";

const logger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

test("job enqueue is idempotent and concurrent workers claim a record only once", async () => {
  const { db } = await createTestContext();
  const queue = `tests-${createUuid()}`;
  const input = { queue, name: "test.once", payload: { value: 7 }, idempotencyKey: "request-7" };
  const firstId = await enqueueJob(db, input);
  const duplicateId = await enqueueJob(db, input);
  expect(duplicateId).toBe(firstId);

  const claims = await Promise.all([claimNextJob(db, queue), claimNextJob(db, queue)]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(claims.find(Boolean)).toMatchObject({ id: firstId, name: "test.once", attemptCount: 1 });

  const otherJobId = await enqueueJob(db, {
    queue,
    name: "test.different",
    payload: { value: 7 },
    idempotencyKey: "request-7",
  });
  expect(otherJobId).not.toBe(firstId);
});

test("registered job handlers complete claimed work exactly once", async () => {
  const { db } = await createTestContext();
  const queue = `tests-${createUuid()}`;
  const calls: string[] = [];
  const registry = new JobRegistry();
  registry.register("test.complete", async (payload, context) => {
    calls.push(`${String(payload.value)}:${context.jobId}`);
  });
  const id = await enqueueJob(db, { queue, name: "test.complete", payload: { value: 42 } });

  expect(await runNextJob(db, registry, logger, { queue })).toBe(true);
  expect(await runNextJob(db, registry, logger, { queue })).toBe(false);
  const result = rowsOf<{ status: string; attempt_count: number; completed_at: Date | null }>(
    await db.execute(sql`select status, attempt_count, completed_at from background_jobs where id = ${id}`),
  )[0];
  expect(result).toMatchObject({ status: "completed", attempt_count: 1 });
  expect(result?.completed_at).toBeTruthy();
  expect(calls).toEqual([`42:${id}`]);
});

test("long-lived worker processes queued work and stops gracefully", async () => {
  const { db } = await createTestContext();
  const id = await enqueueJob(db, { name: "test.worker_stop", payload: {} });
  const registry = new JobRegistry();
  let worker: ReturnType<typeof startJobWorker> | undefined;
  registry.register("test.worker_stop", async () => worker?.stop());

  worker = startJobWorker({ db, registry, logger });
  await worker.done;

  const rows = rowsOf<{ status: string; completed_at: Date | null }>(
    await db.execute(sql`select status, completed_at from background_jobs where id = ${id}`),
  );
  expect(rows[0]?.status).toBe("completed");
  expect(rows[0]?.completed_at).toBeTruthy();
});

test("handler failures retry with bounded delay then stop at max attempts without storing messages", async () => {
  const { db } = await createTestContext();
  const queue = `tests-${createUuid()}`;
  const registry = new JobRegistry();
  registry.register("test.retry", async () => {
    throw new Error("sensitive details must not be persisted");
  });
  const id = await enqueueJob(db, { queue, name: "test.retry", payload: {}, maxAttempts: 2 });
  const options = { queue, retryBaseMs: 10, retryMaxMs: 100 };

  expect(await runNextJob(db, registry, logger, options)).toBe(true);
  await Bun.sleep(150);
  expect(await runNextJob(db, registry, logger, options)).toBe(true);

  const rows = rowsOf<{ status: string; attempt_count: number; last_error_code: string }>(
    await db.execute(sql`select status, attempt_count, last_error_code from background_jobs where id = ${id}`),
  );
  expect(rows[0]).toMatchObject({ status: "dead", attempt_count: 2, last_error_code: "JOB_HANDLER_FAILED" });
  expect(JSON.stringify(rows)).not.toContain("sensitive details");
  expect(await requeueDeadJob(db, id)).toBe(true);
  expect(await requeueDeadJob(db, id)).toBe(false);
  const requeued = rowsOf<{ status: string; attempt_count: number; last_error_code: string | null }>(
    await db.execute(sql`select status, attempt_count, last_error_code from background_jobs where id = ${id}`),
  )[0];
  expect(requeued).toMatchObject({ status: "pending", attempt_count: 0, last_error_code: null });
});

test("jobs scheduled in the future are not claimed early", async () => {
  const { db } = await createTestContext();
  const queue = `tests-${createUuid()}`;
  await enqueueJob(db, { queue, name: "test.future", payload: {}, runAt: new Date(Date.now() + 60_000) });
  expect(await claimNextJob(db, queue)).toBeNull();
});
