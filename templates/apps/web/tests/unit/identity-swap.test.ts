import { expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { swapIdentity } from "../../src/features/identity/lib/leave-session.ts";

test("switching identity refreshes mounted session observers instead of orphaning them", async () => {
  let who = "admin";
  const client = new QueryClient();
  const observer = new QueryObserver(client, { queryKey: ["session"], queryFn: async () => who });
  const seen: unknown[] = [];
  const unsubscribe = observer.subscribe((result) => seen.push(result.data));
  await observer.refetch();
  who = "staff";
  await swapIdentity(client);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(observer.getCurrentResult().data).toBe("staff");
  unsubscribe();
});
