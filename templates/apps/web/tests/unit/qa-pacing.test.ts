import { expect, test } from "bun:test";
import { signInDelay } from "../browser/pacing.ts";

test("the fourth sign-in in a streak waits until the window has reset", () => {
  expect(signInDelay([0, 1000, 2000], 3000)).toBe(9000);
});

test("short streaks and idle gaps never wait", () => {
  expect(signInDelay([], 0)).toBe(0);
  expect(signInDelay([0, 1000], 2000)).toBe(0);
  expect(signInDelay([0, 1000, 2000], 20_000)).toBe(0);
});
