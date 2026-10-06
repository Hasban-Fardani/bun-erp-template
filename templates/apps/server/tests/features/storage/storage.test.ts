import { expect, test } from "bun:test";
import type { Env } from "../../../config/index.ts";
import { createStorage } from "../../../infra/storage.ts";
import { testEnv } from "../../support/fixtures.ts";

test("createStorage maps the environment onto the configured driver", async () => {
  const root = `${Bun.env.TMPDIR ?? "/tmp"}/erp-storage-${crypto.randomUUID()}`;
  const env = {
    ...testEnv,
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_ROOT: root,
    STORAGE_PUBLIC_URL: "https://cdn.example.test",
  } as Env;
  try {
    const storage = createStorage({ env });
    expect(storage.name).toBe("local");
    await storage.putJson("config/app.json", { theme: "dark" });
    expect(await storage.getJson<{ theme: string }>("config/app.json")).toEqual({ theme: "dark" });
    expect(await storage.url("config/app.json")).toBe("https://cdn.example.test/config/app.json");
  } finally {
    await Bun.$`rm -rf ${root}`.quiet();
  }
});

test("an unknown STORAGE_DRIVER fails at createStorage", () => {
  const env = { ...testEnv, STORAGE_DRIVER: "ftp" } as unknown as Env;
  expect(() => createStorage({ env })).toThrow("Unknown storage driver");
});

test("the memory driver works through the environment mapping", async () => {
  const env = { ...testEnv, STORAGE_DRIVER: "memory" } as Env;
  const storage = createStorage({ env });
  expect(storage.name).toBe("memory");
  await storage.put("notes/a.txt", "hi");
  expect(new TextDecoder().decode(await storage.get("notes/a.txt"))).toBe("hi");
  expect(await storage.exists("notes/a.txt")).toBe(true);
});

test("an s3 driver resolves lazily and fails only when used without a bucket", async () => {
  const env = { ...testEnv, STORAGE_DRIVER: "s3", S3_BUCKET: "" } as Env;
  const storage = createStorage({ env });
  expect(storage.name).toBe("s3");
  await expect(storage.get("a.txt")).rejects.toThrow("bucket");
});

test("an r2 driver needs its Worker binding", async () => {
  const env = { ...testEnv, STORAGE_DRIVER: "r2", STORAGE_PUBLIC_URL: "https://files.example.test" } as Env;
  const storage = createStorage({ env });
  expect(storage.name).toBe("r2");
  await expect(storage.exists("a.txt")).rejects.toThrow("binding");
});
