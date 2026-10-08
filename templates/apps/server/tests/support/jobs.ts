import { createUuid } from "@bun-erp/utils";
import type { AppContext } from "@/bootstrap/context.ts";
import type { Logger } from "@/infra/observability/logger.ts";
import { createTestContext } from "./fixtures.ts";

/** A logger that records nothing; job tests assert on rows, not on log lines. */
export const silentLogger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

/**
 * Context plus a queue name no other test can see. Jobs enqueued on `queue` can only be claimed by
 * a runner or worker bound to it, so a file never depends on what an earlier file left on the
 * `default` queue, and a slow machine cannot make two tests fight over one row.
 */
export async function createJobTest(): Promise<{ db: AppContext["db"]; queue: string }> {
  const { db } = await createTestContext();
  return { db, queue: `tests-${createUuid()}` };
}

/** Polls until `check` returns a value; fails with `label` after `timeoutMs` instead of hanging. */
export async function waitFor<T>(
  check: () => T | undefined | Promise<T | undefined>,
  label: string,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value !== undefined) return value;
    await Bun.sleep(10);
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`);
}
