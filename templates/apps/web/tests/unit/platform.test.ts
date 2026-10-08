import { expect, test } from "bun:test";
import { commandShortcut, isApplePlatform } from "../../src/lib/platform.ts";

test("macOS and iOS platforms are Apple", () => {
  expect(isApplePlatform({ platform: "MacIntel" })).toBe(true);
  expect(isApplePlatform({ platform: "iPhone" })).toBe(true);
  expect(isApplePlatform({ userAgentData: { platform: "macOS" }, platform: "" })).toBe(true);
});

test("Windows, Linux and a missing navigator are not Apple", () => {
  expect(isApplePlatform({ platform: "Win32" })).toBe(false);
  expect(isApplePlatform({ platform: "Linux x86_64" })).toBe(false);
  expect(isApplePlatform(null)).toBe(false);
});

test("the shortcut hint is Cmd+K on Apple and Ctrl+K elsewhere", () => {
  expect(commandShortcut({ platform: "MacIntel" })).toBe("⌘K");
  expect(commandShortcut({ platform: "Win32" })).toBe("Ctrl+K");
  expect(commandShortcut(null)).toBe("Ctrl+K");
});
