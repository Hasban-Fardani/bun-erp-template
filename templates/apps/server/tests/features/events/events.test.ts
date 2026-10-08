import { expect, test } from "bun:test";
import { createUuid } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import type { Database } from "@/database/index.ts";
import { rowsOf } from "@/database/rows.ts";
import { createEventBus, defineEvent, defineListener, dispatch, registerEventListeners } from "@/infra/events/index.ts";
import { runJobBatch } from "@/infra/jobs/queue.ts";
import { JobRegistry } from "@/infra/jobs/registry.ts";
import type { Logger } from "@/infra/observability/logger.ts";
import { createTestContext } from "../../support/fixtures.ts";

const noop = (): void => {};
const logger: Logger = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };

type Paid = { invoiceId: string; amount: number };

function unique() {
  const id = createUuid().replaceAll("-", "").slice(0, 12);
  return { queue: `ev-${id}`, event: defineEvent<Paid>(`invoice.paid_${id}`) };
}

async function jobsFor(db: Database, queue: string) {
  return rowsOf<{ job_name: string; status: string; payload: Paid }>(
    await db.execute(
      sql`select job_name, status, payload from background_jobs where queue_name = ${queue} order by job_name`,
    ),
  );
}

test("dispatch enqueues one durable job per listener, inside the caller's transaction", async () => {
  const { db } = await createTestContext();
  const { queue, event } = unique();
  const seen: string[] = [];
  const bus = createEventBus([
    defineListener({
      name: "email-customer",
      event,
      queue,
      handler: async (p) => void seen.push(`email:${p.invoiceId}`),
    }),
    defineListener({ name: "update-ledger", event, queue, handler: async (p) => void seen.push(`ledger:${p.amount}`) }),
  ]);

  const count = await db.transaction((tx) =>
    bus.dispatch(tx as unknown as Database, event, { invoiceId: "i1", amount: 5 }),
  );
  expect(count).toBe(2);
  expect((await jobsFor(db, queue)).map((j) => j.status)).toEqual(["pending", "pending"]);

  const registry = new JobRegistry();
  bus.registerHandlers(registry);
  expect(await runJobBatch(db, registry, logger, { queue, retryBaseMs: 10, retryMaxMs: 20 })).toBe(2);
  expect(seen.sort()).toEqual(["email:i1", "ledger:5"]);
});

test("a rolled-back transaction dispatches nothing", async () => {
  const { db } = await createTestContext();
  const { queue, event } = unique();
  const bus = createEventBus([defineListener({ name: "only", event, queue, handler: async () => {} })]);

  await expect(
    db.transaction(async (tx) => {
      await bus.dispatch(tx as unknown as Database, event, { invoiceId: "i2", amount: 1 });
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");

  expect(await jobsFor(db, queue)).toEqual([]);
});

test("a failing listener retries on its own job without blocking its siblings", async () => {
  const { db } = await createTestContext();
  const { queue, event } = unique();
  let attempts = 0;
  const ok: string[] = [];
  const bus = createEventBus([
    defineListener({
      name: "flaky",
      event,
      queue,
      handler: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient");
      },
    }),
    defineListener({ name: "steady", event, queue, handler: async (p) => void ok.push(p.invoiceId) }),
  ]);
  await bus.dispatch(db, event, { invoiceId: "i3", amount: 1 });

  const registry = new JobRegistry();
  bus.registerHandlers(registry);
  await runJobBatch(db, registry, logger, { queue, retryBaseMs: 10, retryMaxMs: 20 });
  expect(ok).toEqual(["i3"]);
  await Bun.sleep(80);
  await runJobBatch(db, registry, logger, { queue, retryBaseMs: 10, retryMaxMs: 20 });

  expect(attempts).toBe(2);
  expect((await jobsFor(db, queue)).map((j) => j.status)).toEqual(["completed", "completed"]);
});

test("dispatching twice with the same idempotency key runs each listener once", async () => {
  const { db } = await createTestContext();
  const { queue, event } = unique();
  const runs: string[] = [];
  const bus = createEventBus([
    defineListener({ name: "once", event, queue, handler: async (p) => void runs.push(p.invoiceId) }),
  ]);

  await bus.dispatch(db, event, { invoiceId: "i4", amount: 1 }, { idempotencyKey: "invoice-i4-paid" });
  await bus.dispatch(db, event, { invoiceId: "i4", amount: 1 }, { idempotencyKey: "invoice-i4-paid" });
  expect(await jobsFor(db, queue)).toHaveLength(1);

  const registry = new JobRegistry();
  bus.registerHandlers(registry);
  await runJobBatch(db, registry, logger, { queue, retryBaseMs: 10, retryMaxMs: 20 });
  expect(runs).toEqual(["i4"]);
});

test("an event with no listeners is a no-op", async () => {
  const { db } = await createTestContext();
  const { event } = unique();
  expect(await createEventBus([]).dispatch(db, event, { invoiceId: "i5", amount: 1 })).toBe(0);
});

test("the process-wide dispatch uses the listeners registered at boot", async () => {
  const { db } = await createTestContext();
  const { queue, event } = unique();
  registerEventListeners([defineListener({ name: "global", event, queue, handler: async () => {} })]);
  try {
    expect(await dispatch(db, event, { invoiceId: "i6", amount: 1 })).toBe(1);
    expect(await jobsFor(db, queue)).toHaveLength(1);
  } finally {
    registerEventListeners([]);
  }
});

test("names and duplicates are validated", () => {
  const event = defineEvent<Paid>("invoice.paid");
  expect(() => defineEvent("Invoice Paid")).toThrow();
  expect(() => defineListener({ name: "Bad Name", event, handler: async () => {} })).toThrow();
  const listener = defineListener({ name: "dup", event, handler: async () => {} });
  expect(() => createEventBus([listener, listener])).toThrow(/dup/);
});

test("listener handlers are registered once per job name", () => {
  const event = defineEvent<Paid>("invoice.settled");
  const bus = createEventBus([defineListener({ name: "alpha", event, handler: async () => {} })]);
  const registry = new JobRegistry();
  bus.registerHandlers(registry);
  expect(registry.get("event.invoice.settled.alpha")).toBeDefined();
  expect(() => bus.registerHandlers(registry)).toThrow();
});
