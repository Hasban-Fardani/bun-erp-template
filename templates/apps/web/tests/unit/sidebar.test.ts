import { expect, test } from "bun:test";
import { persistSidebarCollapsed, readSidebarCollapsed } from "../../src/lib/sidebar.ts";

test("the sidebar defaults to expanded when storage is unavailable or throws", () => {
  expect(
    readSidebarCollapsed({
      getItem: () => {
        throw new Error("storage blocked");
      },
    }),
  ).toBe(false);
  expect(readSidebarCollapsed({ getItem: () => null })).toBe(false);
});

test("the collapse preference round-trips through injected storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  persistSidebarCollapsed(true, storage);
  expect(readSidebarCollapsed(storage)).toBe(true);

  persistSidebarCollapsed(false, storage);
  expect(readSidebarCollapsed(storage)).toBe(false);
});

test("a blocked storage write does not interrupt collapsing the sidebar", () => {
  expect(() =>
    persistSidebarCollapsed(true, {
      setItem: () => {
        throw new Error("storage blocked");
      },
    }),
  ).not.toThrow();
});
