import { expect, test } from "bun:test";
import { isThemePreference, resolveTheme } from "../../src/lib/theme.ts";

test("resolveTheme maps the stored preference and the device setting to a palette", () => {
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
});

test("isThemePreference accepts only the three shipped choices", () => {
  expect(isThemePreference("light")).toBe(true);
  expect(isThemePreference("dark")).toBe(true);
  expect(isThemePreference("system")).toBe(true);
  expect(isThemePreference("gelap")).toBe(false);
  expect(isThemePreference(undefined)).toBe(false);
});
