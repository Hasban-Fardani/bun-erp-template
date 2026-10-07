import { expect, test } from "bun:test";
import { isNativePlatform, resolveApiBase } from "../../src/lib/env.ts";

test("a configured API origin wins and loses its trailing slash", () => {
  expect(resolveApiBase("https://api.example.test/", false)).toBe("https://api.example.test");
  expect(resolveApiBase("  https://api.example.test  ", false)).toBe("https://api.example.test");
});

test("same-origin stays the development default outside a native shell", () => {
  expect(resolveApiBase(undefined, false)).toBe("");
  expect(resolveApiBase("", false)).toBe("");
});

test("a native shell without an API origin fails loudly instead of calling the webview origin", () => {
  expect(() => resolveApiBase(undefined, true)).toThrow(/VITE_API_BASE_URL/);
});

test("isNativePlatform only trusts an explicit Capacitor signal", () => {
  expect(isNativePlatform({})).toBe(false);
  expect(isNativePlatform({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
  expect(isNativePlatform({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
});
