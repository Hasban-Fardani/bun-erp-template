import { expect, test } from "bun:test";
import { createUuid } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import type { Database } from "../../../database/index.ts";
import { rowsOf } from "../../../database/rows.ts";
import { claimNextJob, enqueueJob, runJobBatch, runJobById } from "../../../infra/jobs/queue.ts";
import { JobRegistry } from "../../../infra/jobs/registry.ts";
import { JobWakeUp, type JobWakeUpDriver, type JobWakeUpSignal } from "../../../infra/jobs/wake-up.ts";
import type { Logger } from "../../../infra/observability/logger.ts";
import { createTestContext } from "../../support/fixtures.ts";

// slop-ok: the no-op logger fixture is deliberately identical across the job test files
const logger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

/** A clean context plus a queue name no other test file can see. */
async function jobTest() {
  const { db } = await createTestContext();
  return { db, queue: `tests-${createUuid()}` };
}

test("a wake-up is sent once after commit and never after a rollback", async () => {
  const { db, queue } = await jobTest();
  const sent: JobWakeUpSignal[] = [];
  const driver: JobWakeUpDriver = {
    send: async (signal) => {
      sent.push(signal);
    },
  };
  const dbWithWakeUp = new JobWakeUp(driver).wrap(db);

  await expect(
    dbWithWakeUp.transaction(async (tx) => {
      await enqueueJob(tx, { queue, name: "test.wake_up.rollback", payload: {} });
      throw new Error("feature write failed");
    }),
  ).rejects.toThrow("feature write failed");
  expect(sent).toEqual([]);
  expect(await countJobs(db, queue)).toBe(0);

  const jobId = await dbWithWakeUp.transaction((tx) =>
    enqueueJob(tx, { queue, name: "test.wake_up.commit", payload: {} }),
  );
  expect(sent).toEqual([{ jobId }]);
  expect(await countJobs(db, queue)).toBe(1);
});

test("runJobById claims once and is a no-op for finished, claimed, or unknown jobs", async () => {
  const { db, queue } = await jobTest();
  const calls: string[] = [];
  const registry = new JobRegistry();
  registry.register("test.wake_up.by_id", async (_payload, context) => {
    calls.push(context.jobId);
  });

  const finished = await enqueueJob(db, { queue, name: "test.wake_up.by_id", payload: {} });
  expect(await runJobById(db, registry, logger, finished)).toBe(true);
  expect(await runJobById(db, registry, logger, finished)).toBe(false);

  const claimed = await enqueueJob(db, { queue, name: "test.wake_up.by_id", payload: {} });
  expect(await claimNextJob(db, queue)).toMatchObject({ id: claimed });
  expect(await runJobById(db, registry, logger, claimed)).toBe(false);

  const raced = await enqueueJob(db, { queue, name: "test.wake_up.by_id", payload: {} });
  const results = await Promise.all([runJobById(db, registry, logger, raced), runJobById(db, registry, logger, raced)]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(calls).toEqual([finished, raced]);
  expect(await runJobById(db, registry, logger, createUuid())).toBe(false);
});

test("runJobBatch stops at the job limit and the wall-clock budget", async () => {
  const { db, queue } = await jobTest();
  const registry = new JobRegistry();
  registry.register("test.wake_up.budget", async () => {});
  for (let index = 0; index < 3; index += 1) {
    await enqueueJob(db, { queue, name: "test.wake_up.budget", payload: { index } });
  }

  expect(await runJobBatch(db, registry, logger, { queue, limit: 2 })).toBe(2);
  expect(await runJobBatch(db, registry, logger, { queue, timeBudgetMs: 0 })).toBe(0);
  expect(await runJobBatch(db, registry, logger, { queue })).toBe(1);
});

async function countJobs(db: Database, queue: string): Promise<number> {
  const rows = rowsOf<{ count: string | number }>(
    await db.execute(sql`select count(*) as count from background_jobs where queue_name = ${queue}`),
  );
  return Number(rows[0]?.count ?? 0);
}
