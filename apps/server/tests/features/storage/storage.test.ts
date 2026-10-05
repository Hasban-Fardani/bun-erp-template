import { expect, test } from "bun:test";
import type { Env } from "../../../platform/config/index.ts";
import type { Logger } from "../../../platform/observability/logger.ts";
import { createMemoryStorageDriver } from "../../../platform/storage/drivers/memory.ts";
import { contentTypeFor, storageKey } from "../../../platform/storage/key.ts";
import { createStorage } from "../../../platform/storage/storage.ts";
import { testEnv } from "../../support/fixtures.ts";

const logger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

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
  const storage = createStorage({ env: testEnv, logger, driver: createMemoryStorageDriver() });
  await storage.put("notes/a.txt", "hello");
  expect(new TextDecoder().decode(await storage.get("notes/a.txt"))).toBe("hello");
  expect(await storage.exists("notes/a.txt")).toBe(true);
  expect(await storage.delete("notes/a.txt")).toBe(true);
  expect(await storage.exists("notes/a.txt")).toBe(false);

  await storage.putJson("config/app.json", { theme: "dark" });
  expect(await storage.getJson<{ theme: string }>("config/app.json")).toEqual({ theme: "dark" });
});

test("the local driver writes under STORAGE_LOCAL_ROOT and builds a public URL", async () => {
  const root = `${Bun.env.TMPDIR ?? "/tmp"}/erp-storage-${crypto.randomUUID()}`;
  const env = {
    ...testEnv,
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_ROOT: root,
    STORAGE_PUBLIC_URL: "https://cdn.example.test",
  } as Env;
  try {
    const storage = createStorage({ env, logger });
    expect(storage.name).toBe("local");
    await storage.put("avatars/a.png", new Uint8Array([1, 2, 3]), { contentType: "image/png" });
    expect(await storage.exists("avatars/a.png")).toBe(true);
    expect(Array.from((await storage.get("avatars/a.png")) ?? [])).toEqual([1, 2, 3]);
    expect(await storage.url("avatars/a.png")).toBe("https://cdn.example.test/avatars/a.png");
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

test("an unknown driver fails at createStorage, and a runtime-only driver fails on first use", async () => {
  const unknown = { ...testEnv, STORAGE_DRIVER: "ftp" } as unknown as Env;
  expect(() => createStorage({ env: unknown, logger })).toThrow("Unknown storage driver");

  const r2 = { ...testEnv, STORAGE_DRIVER: "r2", STORAGE_PUBLIC_URL: "https://files.example.test" } as Env;
  const storage = createStorage({ env: r2, logger });
  expect(storage.name).toBe("r2");
  await expect(storage.get("a.txt")).rejects.toThrow("binding");
});
