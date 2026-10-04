import { beforeEach, expect, test } from "bun:test";
import { createOfflineStore, type OfflineAdapter } from "../../src/features/offline/stores/offline-store.ts";

function createMemoryAdapter(): OfflineAdapter {
  const records = new Map<string, { value: string; updatedAt: string }>();
  const id = (namespace: string, key: string) => `${namespace}\u001f${key}`;
  return {
    async get(namespace, key) {
      return records.get(id(namespace, key));
    },
    async put(namespace, key, value, updatedAt) {
      records.set(id(namespace, key), { value, updatedAt });
    },
    async list(namespace) {
      return [...records.entries()]
        .filter(([key]) => key.startsWith(`${namespace}\u001f`))
        .map(([key, record]) => ({ key: key.slice(namespace.length + 1), ...record }));
    },
    async delete(namespace, key) {
      records.delete(id(namespace, key));
    },
    async clear(namespace) {
      for (const key of records.keys()) if (key.startsWith(`${namespace}\u001f`)) records.delete(key);
    },
  };
}

let store: ReturnType<typeof createOfflineStore>;

beforeEach(() => {
  store = createOfflineStore(createMemoryAdapter());
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
