import { expect, test } from "bun:test";
import { createMemoryStorageDriver } from "../src/server/drivers/memory.ts";
import { contentTypeFor, storageKey } from "../src/server/key.ts";
import { createObjectStorage } from "../src/server/storage.ts";

test("storage keys reject traversal and normalize a leading slash", () => {
  expect(storageKey("/avatars/user-1.png")).toBe("avatars/user-1.png");
  expect(() => storageKey("")).toThrow();
  expect(() => storageKey("../secret")).toThrow();
  expect(() => storageKey("a\\b")).toThrow();
  expect(() => storageKey("x".repeat(513))).toThrow();
});

test("contentTypeFor infers common extensions and keeps an explicit type", () => {
  expect(contentTypeFor("report.pdf")).toBe("application/pdf");
  expect(contentTypeFor("data.bin")).toBe("application/octet-stream");
  expect(contentTypeFor("noext", "text/csv")).toBe("text/csv");
});

test("the memory driver round-trips bytes and JSON", async () => {
  const storage = createObjectStorage({ config: { driver: "memory" }, driver: createMemoryStorageDriver() });
  await storage.put("notes/a.txt", "hello");
  expect(new TextDecoder().decode(await storage.get("notes/a.txt"))).toBe("hello");
  expect(await storage.exists("notes/a.txt")).toBe(true);
  expect(await storage.delete("notes/a.txt")).toBe(true);
  expect(await storage.exists("notes/a.txt")).toBe(false);

  await storage.putJson("config/app.json", { theme: "dark" });
  expect(await storage.getJson<{ theme: string }>("config/app.json")).toEqual({ theme: "dark" });
});

test("the local driver writes under localRoot and builds a public URL", async () => {
  const root = `${Bun.env.TMPDIR ?? "/tmp"}/erp-storage-${crypto.randomUUID()}`;
  try {
    const storage = createObjectStorage({
      config: { driver: "local", localRoot: root, publicUrl: "https://cdn.example.test" },
    });
    expect(storage.name).toBe("local");
    await storage.put("avatars/a.png", new Uint8Array([1, 2, 3]), { contentType: "image/png" });
    expect(await storage.exists("avatars/a.png")).toBe(true);
    expect(Array.from((await storage.get("avatars/a.png")) ?? [])).toEqual([1, 2, 3]);
    expect(await storage.url("avatars/a.png")).toBe("https://cdn.example.test/avatars/a.png");
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

test("an unknown driver fails at creation, and a runtime-only driver fails on first use", async () => {
  expect(() => createObjectStorage({ config: { driver: "ftp" } })).toThrow("Unknown storage driver");

  const r2 = createObjectStorage({ config: { driver: "r2", publicUrl: "https://files.example.test" } });
  expect(r2.name).toBe("r2");
  await expect(r2.get("a.txt")).rejects.toThrow("binding");

  const s3 = createObjectStorage({ config: { driver: "s3" } });
  await expect(s3.get("a.txt")).rejects.toThrow("bucket");
});
