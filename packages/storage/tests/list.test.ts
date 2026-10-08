import { expect, test } from "bun:test";
import { createMemoryStorageDriver } from "../src/server/drivers/memory.ts";
import { createObjectStorage } from "../src/server/storage.ts";
import type { StorageListEntry } from "../src/server/types.ts";

async function collect(iterator: AsyncIterable<StorageListEntry>): Promise<StorageListEntry[]> {
  const entries: StorageListEntry[] = [];
  for await (const entry of iterator) entries.push(entry);
  return entries;
}

test("the memory driver lists keys under a prefix in key order, with sizes", async () => {
  const storage = createObjectStorage({ config: { driver: "memory" }, driver: createMemoryStorageDriver() });
  await storage.put("b/two.txt", "22");
  await storage.put("a/one.txt", "1");
  await storage.put("a/three.txt", "333");
  expect(await collect(storage.listAll("a/"))).toEqual([
    { key: "a/one.txt", size: 1 },
    { key: "a/three.txt", size: 3 },
  ]);
  expect((await collect(storage.listAll())).map((entry) => entry.key)).toEqual([
    "a/one.txt",
    "a/three.txt",
    "b/two.txt",
  ]);
});

test("listAll follows page cursors until the driver stops returning one", async () => {
  const keys = ["k1", "k2", "k3", "k4", "k5"];
  const calls: Array<string | undefined> = [];
  const storage = createObjectStorage({
    config: { driver: "paged" },
    driver: {
      name: "paged",
      put: async () => ({ key: "", size: 0, contentType: "" }),
      get: async () => undefined,
      delete: async () => false,
      exists: async () => false,
      url: async () => "",
      async list(options) {
        calls.push(options?.cursor);
        const start = options?.cursor ? Number(options.cursor) : 0;
        const page = keys.slice(start, start + 2).map((key) => ({ key, size: 1 }));
        const next = start + 2;
        return { objects: page, cursor: next < keys.length ? String(next) : undefined };
      },
    },
  });
  expect((await collect(storage.listAll())).map((entry) => entry.key)).toEqual(keys);
  expect(calls).toEqual([undefined, "2", "4"]);
});

test("the local driver lists files under its root and the R2 driver lists through the binding", async () => {
  const root = `${Bun.env.TMPDIR ?? "/tmp"}/erp-storage-${crypto.randomUUID()}`;
  try {
    const local = createObjectStorage({ config: { driver: "local", localRoot: root } });
    await local.put("docs/a.txt", "aa");
    await local.put("docs/sub/b.txt", "b");
    await local.put("other/c.txt", "c");
    expect(await collect(local.listAll("docs/"))).toEqual([
      { key: "docs/a.txt", size: 2 },
      { key: "docs/sub/b.txt", size: 1 },
    ]);
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }

  const requested: Array<{ prefix?: string; cursor?: string }> = [];
  const bucket = {
    put: async () => null,
    get: async () => null,
    head: async () => null,
    delete: async () => {},
    list: async (options: { prefix?: string; cursor?: string }) => {
      requested.push(options);
      return { objects: [{ key: "x/1.bin", size: 7 }], truncated: false };
    },
  };
  const r2 = createObjectStorage({
    config: { driver: "r2", publicUrl: "https://files.example.test" },
    bindings: { STORAGE: bucket },
  });
  expect(await collect(r2.listAll("x/"))).toEqual([{ key: "x/1.bin", size: 7 }]);
  expect(requested[0]?.prefix).toBe("x/");
});

test("listing a local root that does not exist yet is empty, not an error", async () => {
  const local = createObjectStorage({
    config: { driver: "local", localRoot: `${Bun.env.TMPDIR ?? "/tmp"}/erp-missing-${crypto.randomUUID()}` },
  });
  expect(await collect(local.listAll())).toEqual([]);
});
