import { expect, test } from "bun:test";
import { safeRedirectTarget } from "../../src/lib/redirect.ts";

test("safeRedirectTarget accepts same-origin paths with search and hash", () => {
  expect(safeRedirectTarget("/notifications")).toBe("/notifications");
  expect(safeRedirectTarget("/notifications?page=2#top")).toBe("/notifications?page=2#top");
  expect(safeRedirectTarget("/")).toBe("/");
});

test("safeRedirectTarget rejects external, protocol-relative and malformed targets", () => {
  expect(safeRedirectTarget("https://evil.example/steal")).toBeUndefined();
  expect(safeRedirectTarget("//evil.example")).toBeUndefined();
  expect(safeRedirectTarget("/\\evil.example")).toBeUndefined();
  expect(safeRedirectTarget("notifications")).toBeUndefined();
  expect(safeRedirectTarget(undefined)).toBeUndefined();
  expect(safeRedirectTarget(42)).toBeUndefined();
});

test("safeRedirectTarget rejects the login route so a redirect cannot loop", () => {
  expect(safeRedirectTarget("/login")).toBeUndefined();
  expect(safeRedirectTarget("/login?redirect=/login")).toBeUndefined();
  expect(safeRedirectTarget("/login#recovery")).toBeUndefined();
});
