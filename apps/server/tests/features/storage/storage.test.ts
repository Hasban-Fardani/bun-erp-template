import { expect, test } from "bun:test";
import type { Env } from "../../../platform/config/index.ts";
import { createStorage } from "../../../platform/storage.ts";
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
