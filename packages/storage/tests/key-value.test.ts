import { expect, test } from "bun:test";
import { createLocalStorageAdapter, type StringStorage } from "../src/browser/local-storage.ts";
import { getDefaultKeyValueStore } from "../src/default.ts";
import { createKeyValueStore } from "../src/key-value.ts";
import { createMemoryAdapter } from "../src/memory.ts";

function fakeStringStorage(): StringStorage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    key: (index) => [...map.keys()][index] ?? null,
  };
}

test("a store namespaces typed JSON records per feature", async () => {
  const store = createKeyValueStore(createMemoryAdapter());
  await store.put("identity", "session", { name: "Example", roles: ["owner"] });
  await store.put("reports", "draft-1", { name: "Draft" });

  expect(await store.get<{ name: string }>("identity", "session")).toMatchObject({ value: { name: "Example" } });
  expect((await store.list("identity")).map((record) => record.key)).toEqual(["session"]);
  expect(await store.get("identity", "missing")).toBeUndefined();
});

test("records delete individually and clear by namespace without touching others", async () => {
  const store = createKeyValueStore(createMemoryAdapter());
  await store.put("drafts", "one", 1);
  await store.put("drafts", "two", 2);
  await store.put("settings", "theme", "dark");

  await store.delete("drafts", "one");
  expect((await store.list("drafts")).map((record) => record.key)).toEqual(["two"]);
  await store.clear("drafts");
  expect(await store.list("drafts")).toEqual([]);
  expect(await store.get("settings", "theme")).toMatchObject({ value: "dark" });
});

test("the localStorage adapter round-trips through a Web Storage backend", async () => {
  const backend = fakeStringStorage();
  const store = createKeyValueStore(createLocalStorageAdapter(backend, "test"));
  await store.put("identity", "session", { name: "Example" });
  expect(await store.get<{ name: string }>("identity", "session")).toMatchObject({ value: { name: "Example" } });
  expect(backend.length).toBe(1);
  await store.clear("identity");
  expect(await store.list("identity")).toEqual([]);
});

test("the default resolver returns a working store in any runtime", async () => {
  const store = await getDefaultKeyValueStore();
  await store.put("probe", "key", { ok: true });
  expect(await store.get<{ ok: boolean }>("probe", "key")).toMatchObject({ value: { ok: true } });
  await store.delete("probe", "key");
});
