import { expect, test } from "bun:test";
import { createUuid } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import type { AppContext } from "@/bootstrap/context.ts";
import { rowsOf } from "@/database/rows.ts";
import { claimNextJob, enqueueJob, requeueDeadJob, runNextJob } from "@/infra/jobs/queue.ts";
import { JobRegistry } from "@/infra/jobs/registry.ts";
import { startJobWorker } from "@/infra/jobs/worker.ts";
import { createJobTest, silentLogger as logger, waitFor } from "../../support/jobs.ts";

test("job enqueue is idempotent and concurrent workers claim a record only once", async () => {
  const { db, queue } = await createJobTest();
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
  const { db, queue } = await createJobTest();
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

test("an error marked retryable=false dead-letters on the first attempt; other errors still retry", async () => {
  const { db, queue } = await createJobTest();
  const registry = new JobRegistry();
  registry.register("test.permanent", async () => {
    throw Object.assign(new Error("auth rejected"), { code: "MAIL_SMTP_AUTH", retryable: false });
  });
  registry.register("test.transient", async () => {
    throw Object.assign(new Error("timeout"), { code: "MAIL_HTTP_503", retryable: true });
  });
  registry.register("test.unmarked", async () => {
    throw new Error("boom");
  });
  const permanent = await enqueueJob(db, { queue, name: "test.permanent", payload: {}, maxAttempts: 5 });
  const transient = await enqueueJob(db, { queue, name: "test.transient", payload: {}, maxAttempts: 5 });
  const unmarked = await enqueueJob(db, { queue, name: "test.unmarked", payload: {}, maxAttempts: 5 });

  // A long retry delay keeps the two retried jobs from being re-claimed if the machine stalls.
  const options = { queue, retryBaseMs: 60_000, retryMaxMs: 60_000 };
  for (let i = 0; i < 3; i += 1) expect(await runNextJob(db, registry, logger, options)).toBe(true);

  const statusOf = async (id: string) =>
    rowsOf<{ status: string; attempt_count: number; last_error_code: string }>(
      await db.execute(sql`select status, attempt_count, last_error_code from background_jobs where id = ${id}`),
    )[0];
  expect(await statusOf(permanent)).toMatchObject({
    status: "dead",
    attempt_count: 1,
    last_error_code: "MAIL_SMTP_AUTH",
  });
  expect(await statusOf(transient)).toMatchObject({ status: "pending", attempt_count: 1 });
  expect(await statusOf(unmarked)).toMatchObject({ status: "pending", attempt_count: 1 });
});

test("long-lived worker processes queued work and stops gracefully", async () => {
  const { db, queue } = await createJobTest();
  const id = await enqueueJob(db, { queue, name: "test.worker_stop", payload: {} });
  const registry = new JobRegistry();
  let worker: ReturnType<typeof startJobWorker> | undefined;
  registry.register("test.worker_stop", async () => worker?.stop());

  worker = startJobWorker({ db, registry, logger, queue, pollIntervalMs: 20 });
  await worker.done;

  const rows = rowsOf<{ status: string; completed_at: Date | null }>(
    await db.execute(sql`select status, completed_at from background_jobs where id = ${id}`),
  );
  expect(rows[0]?.status).toBe("completed");
  expect(rows[0]?.completed_at).toBeTruthy();
});

test("a worker bound to a queue never claims another queue's jobs", async () => {
  const { db, queue: mine } = await createJobTest();
  const theirs = `tests-${createUuid()}`;
  const registry = new JobRegistry();
  let worker: ReturnType<typeof startJobWorker> | undefined;
  registry.register("test.mine", async () => worker?.stop());
  const otherId = await enqueueJob(db, { queue: theirs, name: "test.theirs", payload: {} });
  await enqueueJob(db, { queue: mine, name: "test.mine", payload: {} });

  worker = startJobWorker({ db, registry, logger, queue: mine, pollIntervalMs: 20 });
  await worker.done;

  expect(await jobRow(db, otherId)).toMatchObject({ status: "pending", attempt_count: 0 });
});

test("handler failures retry with bounded delay then stop at max attempts without storing messages", async () => {
  const { db, queue } = await createJobTest();
  const registry = new JobRegistry();
  registry.register("test.retry", async () => {
    throw new Error("sensitive details must not be persisted");
  });
  const id = await enqueueJob(db, { queue, name: "test.retry", payload: {}, maxAttempts: 2 });
  const options = { queue, retryBaseMs: 10, retryMaxMs: 100 };

  expect(await runNextJob(db, registry, logger, options)).toBe(true);
  await Bun.sleep(150);
  expect(await runNextJob(db, registry, logger, options)).toBe(true);

  const row = await jobRow(db, id);
  expect(row).toMatchObject({ status: "dead", attempt_count: 2, last_error_code: "JOB_HANDLER_FAILED" });
  expect(JSON.stringify(row)).not.toContain("sensitive details");
  expect(await requeueDeadJob(db, id)).toBe(true);
  expect(await requeueDeadJob(db, id)).toBe(false);
  const requeued = await jobRow(db, id);
  expect(requeued).toMatchObject({ status: "pending", attempt_count: 0, last_error_code: null });
});

test("jobs scheduled in the future are not claimed early", async () => {
  const { db, queue } = await createJobTest();
  await enqueueJob(db, { queue, name: "test.future", payload: {}, runAt: new Date(Date.now() + 60_000) });
  expect(await claimNextJob(db, queue)).toBeNull();
});

test("a transient lease-renewal error does not discard a successful result", async () => {
  const { db, queue } = await createJobTest();
  const leaseMs = 3_000;
  const flaky = flakyRenewalDatabase(db);
  const registry = new JobRegistry();
  registry.register("test.renewal", async () => {
    // Hold the handler until the heartbeat (lease/3) has hit the injected failure: an event, not a
    // sleep, so a loaded machine only makes the test slower, never wrong.
    await waitFor(() => (flaky.failures() > 0 ? true : undefined), "the lease heartbeat to fail once");
  });
  const id = await enqueueJob(db, { queue, name: "test.renewal", payload: {} });

  expect(await runNextJob(flaky.db, registry, logger, { queue, leaseMs })).toBe(true);

  const row = await jobRow(db, id);
  // A successful handler whose renewal blipped must stay completed; setting leaseLost would
  // leave the row running and the worker would claim it again (duplicate side effects).
  expect(row).toMatchObject({ status: "completed", attempt_count: 1 });
  expect(flaky.failures()).toBe(1);
});

test("a job whose handler is not registered yet retries instead of dying on first claim", async () => {
  const { db, queue } = await createJobTest();
  const id = await enqueueJob(db, { queue, name: "test.not_deployed_yet", payload: {}, maxAttempts: 2 });
  const registry = new JobRegistry();
  const options = { queue, retryBaseMs: 10, retryMaxMs: 20 };

  expect(await runNextJob(db, registry, logger, options)).toBe(true);
  const first = await jobRow(db, id);
  // Rolling deploy: the handler may appear seconds later, so the claim is released for a retry.
  expect(first).toMatchObject({ status: "pending", attempt_count: 1, last_error_code: "JOB_HANDLER_NOT_REGISTERED" });

  await Bun.sleep(50);
  expect(await runNextJob(db, registry, logger, options)).toBe(true);
  const second = await jobRow(db, id);
  // Bounded: after maxAttempts the missing handler is terminal, so it cannot loop forever.
  expect(second).toMatchObject({ status: "dead", attempt_count: 2, last_error_code: "JOB_HANDLER_NOT_REGISTERED" });
});

async function jobRow(db: AppContext["db"], id: string) {
  return rowsOf<{ status: string; attempt_count: number; last_error_code: string | null }>(
    await db.execute(sql`select status, attempt_count, last_error_code from background_jobs where id = ${id}`),
  )[0];
}

/** The renewal statement is the only `update background_jobs set lease_expires_at`; the claim is a CTE. */
function flakyRenewalDatabase(db: AppContext["db"]) {
  let failures = 0;
  const wrapped = new Proxy(db, {
    get(target, property, receiver) {
      if (property !== "execute") return Reflect.get(target, property, receiver);
      return async (query: unknown) => {
        if (failures === 0 && isLeaseRenewal(query)) {
          failures += 1;
          throw new Error("connection reset");
        }
        return (target.execute as (statement: unknown) => Promise<unknown>)(query);
      };
    },
  }) as AppContext["db"];
  return { db: wrapped, failures: () => failures };
}

function isLeaseRenewal(query: unknown): boolean {
  const chunks = (query as { queryChunks?: { value?: unknown }[] }).queryChunks ?? [];
  const statement = chunks
    .map((chunk) =>
      Array.isArray(chunk.value) ? chunk.value.join("") : typeof chunk.value === "string" ? chunk.value : "",
    )
    .join("");
  return statement.includes("update background_jobs set lease_expires_at");
}
