import { expect, test } from "bun:test";
import { copyObjects } from "../src/server/copy.ts";
import { createMemoryStorageDriver } from "../src/server/drivers/memory.ts";
import { createObjectStorage } from "../src/server/storage.ts";

const memory = () => createObjectStorage({ config: { driver: "memory" }, driver: createMemoryStorageDriver() });

test("copies a local store into memory, then a re-run copies nothing", async () => {
  const root = `${Bun.env.TMPDIR ?? "/tmp"}/erp-storage-${crypto.randomUUID()}`;
  try {
    const source = createObjectStorage({ config: { driver: "local", localRoot: root } });
    await source.put("avatars/a.png", new Uint8Array([1, 2, 3]));
    await source.put("reports/q1.csv", "a,b\n");
    const destination = memory();

    const first = await copyObjects({ source, destination });
    expect(first).toMatchObject({ copied: 2, skipped: 0, failed: [], bytes: 7 });
    expect(Array.from((await destination.get("avatars/a.png")) ?? [])).toEqual([1, 2, 3]);

    const second = await copyObjects({ source, destination });
    expect(second).toMatchObject({ copied: 0, skipped: 2, failed: [], bytes: 0 });
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

test("an object whose size differs is copied again, so an interrupted copy resumes", async () => {
  const source = memory();
  const destination = memory();
  await source.put("a.txt", "full content");
  await source.put("b.txt", "b");
  await destination.put("a.txt", "part"); // a truncated leftover
  await destination.put("b.txt", "b");

  const summary = await copyObjects({ source, destination });
  expect(summary).toMatchObject({ copied: 1, skipped: 1 });
  expect(new TextDecoder().decode(await destination.get("a.txt"))).toBe("full content");
});

test("dry-run reports what would be copied and writes nothing; prefix limits the scope", async () => {
  const source = memory();
  const destination = memory();
  await source.put("keep/a.txt", "a");
  await source.put("skip/b.txt", "b");

  const dry = await copyObjects({ source, destination, prefix: "keep/", dryRun: true });
  expect(dry).toMatchObject({ copied: 1, skipped: 0, dryRun: true });
  expect(await destination.exists("keep/a.txt")).toBe(false);

  await copyObjects({ source, destination, prefix: "keep/" });
  expect(await destination.exists("keep/a.txt")).toBe(true);
  expect(await destination.exists("skip/b.txt")).toBe(false);
});

test("one failing object is reported and does not stop the rest", async () => {
  const source = memory();
  const destination = memory();
  await source.put("ok.txt", "ok");
  await source.put("bad.txt", "bad");
  const failingGet = source.get.bind(source);
  source.get = async (key) => {
    if (key === "bad.txt") throw new Error("boom");
    return failingGet(key);
  };

  const summary = await copyObjects({ source, destination });
  expect(summary.copied).toBe(1);
  expect(summary.failed).toEqual([{ key: "bad.txt", message: "boom" }]);
});
