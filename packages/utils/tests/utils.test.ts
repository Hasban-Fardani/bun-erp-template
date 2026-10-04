import { expect, test } from "bun:test";
import { createUuid, retryDelayMs } from "../src/index.ts";

test("createUuid returns a cryptographically generated UUID", () => {
  expect(createUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("retryDelayMs grows exponentially, applies jitter and stops at the cap", () => {
  expect(retryDelayMs({ attempt: 1, baseDelayMs: 1_000, maxDelayMs: 8_000, random: () => 0.5 })).toBe(1_000);
  expect(retryDelayMs({ attempt: 3, baseDelayMs: 1_000, maxDelayMs: 8_000, random: () => 0.5 })).toBe(4_000);
  expect(retryDelayMs({ attempt: 10, baseDelayMs: 1_000, maxDelayMs: 8_000, random: () => 1 })).toBe(8_000);
  expect(() => retryDelayMs({ attempt: 0 })).toThrow(RangeError);
});

test("default retry jitter returns a bounded delay using the platform crypto source", () => {
  const delay = retryDelayMs({ attempt: 1, baseDelayMs: 1_000, maxDelayMs: 8_000 });
  expect(delay).toBeGreaterThanOrEqual(500);
  expect(delay).toBeLessThanOrEqual(1_500);
});
