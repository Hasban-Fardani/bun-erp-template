import { beforeEach, expect, test } from "bun:test";
import { createMemoryAdapter } from "@loom/storage";
import { createOfflineStore, type OfflineAdapter } from "../../src/features/offline/stores/offline-store.ts";

let store: ReturnType<typeof createOfflineStore>;

beforeEach(() => {
  store = createOfflineStore(createMemoryAdapter() satisfies OfflineAdapter);
});

test("offline records persist typed JSON and remain isolated by feature namespace", async () => {
  await store.put("identity", "session", { displayName: "Example", roles: ["owner"] });
  await store.put("departments", "draft-1", { name: "Draft" });

  expect(await store.get<{ displayName: string; roles: string[] }>("identity", "session")).toMatchObject({
    value: { displayName: "Example", roles: ["owner"] },
  });
  expect((await store.list("identity")).map((record) => record.key)).toEqual(["session"]);
});

test("offline records can be deleted individually or cleared by feature", async () => {
  await store.put("drafts", "one", { value: 1 });
  await store.put("drafts", "two", { value: 2 });
  await store.put("settings", "theme", "dark");
  await store.delete("drafts", "one");

  expect((await store.list("drafts")).map((record) => record.key)).toEqual(["two"]);
  await store.clear("drafts");
  expect(await store.list("drafts")).toEqual([]);
  expect(await store.get("settings", "theme")).toMatchObject({ value: "dark" });
});
