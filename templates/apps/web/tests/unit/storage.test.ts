import { expect, test } from "bun:test";
import { createMemoryAdapter } from "@loom/storage";
import { webStore } from "../../src/lib/storage.ts";

test("webStore persists namespaced records through an injected adapter", async () => {
  const store = await webStore(createMemoryAdapter());
  await store.put("ui", "theme", "dark");
  expect(await store.get("ui", "theme")).toMatchObject({ value: "dark" });
  await store.delete("ui", "theme");
  expect(await store.get("ui", "theme")).toBeUndefined();
});
