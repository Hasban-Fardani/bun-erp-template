import { expect, test } from "bun:test";
import {
  detectLocale,
  formatDate,
  formatNumber,
  formatRelativeTime,
  LOCALE_STORAGE_KEY,
  persistLocale,
  readStoredLocale,
  resolveInitialLocale,
  resolveLocale,
  resolveMessage,
} from "../src/utils/core.ts";
import { enUS } from "../src/utils/messages/en-US.ts";

test("resolves supported language tags and falls back to English", () => {
  expect(resolveLocale(["fr-FR", "id-ID"])).toBe("id-ID");
  expect(resolveLocale("ID_id")).toBe("id-ID");
  expect(resolveLocale("en-GB")).toBe("en-US");
  expect(resolveLocale("fr-FR")).toBe("en-US");
});

test("a saved locale wins while an unsupported saved value leaves device choice available", () => {
  expect(resolveInitialLocale("en", ["id-ID"])).toBe("en-US");
  expect(resolveInitialLocale("fr-FR", ["id-ID", "en-US"])).toBe("id-ID");
  expect(resolveInitialLocale(undefined, ["fr-FR"])).toBe("en-US");
});

test("reads and writes the canonical preference without propagating storage errors", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  expect(persistLocale("id-ID", storage)).toBe(true);
  expect(values.get(LOCALE_STORAGE_KEY)).toBe("id-ID");
  expect(readStoredLocale(storage)).toBe("id-ID");
  expect(detectLocale(storage)).toBe("id-ID");

  expect(
    readStoredLocale({
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {},
    }),
  ).toBeUndefined();
  expect(
    persistLocale("en-US", {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage blocked");
      },
    }),
  ).toBe(false);
});

test("falls back to the English message when a localized key is absent", () => {
  expect(resolveMessage("common.loading", {}, enUS)).toBe("Loading…");
});

test("formats numbers, dates, and relative times for the active locale", () => {
  expect(formatNumber(1234.5, "en-US")).toBe("1,234.5");
  expect(formatNumber(1234.5, "id-ID")).toBe("1.234,5");
  expect(formatDate("2025-01-02T00:00:00.000Z", "en-US", { timeZone: "UTC", dateStyle: "short" })).toBe("1/2/25");
  expect(formatRelativeTime("2025-01-01T00:00:00.000Z", "en-US", Date.parse("2025-01-02T00:00:00.000Z"))).toBe(
    "yesterday",
  );
});
