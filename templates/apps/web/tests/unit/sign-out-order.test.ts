import { expect, test } from "bun:test";
import { leaveSession } from "../../src/features/identity/lib/leave-session.ts";

test("sign-out navigates away before the cache is cleared, so mounted queries never refetch without a session", async () => {
  const order: string[] = [];
  await leaveSession({ clear: () => order.push("clear") }, async () => {
    order.push("navigate-start");
    await Promise.resolve();
    order.push("navigate-end");
  });
  expect(order).toEqual(["navigate-start", "navigate-end", "clear"]);
});
