import { expect, test } from "bun:test";
import { usingWorkerContext } from "../../infra/cloudflare/lifecycle.ts";

test("Worker invocations own distinct contexts and close after success or failure", async () => {
  const contexts: number[] = [];
  const closed: number[] = [];
  const background: Promise<unknown>[] = [];
  const create = () => {
    const id = contexts.length;
    contexts.push(id);
    return {
      id,
      close: async () => {
        closed.push(id);
      },
    };
  };
  const execution = { waitUntil: (promise: Promise<unknown>) => background.push(promise) };
  const results = await Promise.all([
    usingWorkerContext(create, async (context) => context.id, execution),
    usingWorkerContext(create, async (context) => context.id, execution),
  ]);
  expect(results).toEqual([0, 1]);
  await expect(
    usingWorkerContext(
      create,
      async () => {
        throw new Error("failure");
      },
      execution,
    ),
  ).rejects.toThrow("failure");
  await Promise.all(background);
  expect(closed).toEqual([0, 1, 2]);
});
