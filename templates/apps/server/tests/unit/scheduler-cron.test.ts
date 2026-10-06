import { describe, expect, test } from "bun:test";
import { nextRunAt, parseCron } from "../../infra/jobs/scheduler.ts";

function sorted(values: ReadonlySet<number>): number[] {
  return [...values].sort((a, b) => a - b);
}

describe("cron parser", () => {
  test("expands wildcards, lists, ranges and steps", () => {
    const spec = parseCron("*/15 9-11,23 1,15 * 1-5");
    expect(sorted(spec.minutes)).toEqual([0, 15, 30, 45]);
    expect(sorted(spec.hours)).toEqual([9, 10, 11, 23]);
    expect(sorted(spec.daysOfMonth)).toEqual([1, 15]);
    expect(sorted(spec.months)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(sorted(spec.daysOfWeek)).toEqual([1, 2, 3, 4, 5]);
  });

  test("a step from a value walks to the field maximum", () => {
    const spec = parseCron("5/15 * * * *");
    expect(sorted(spec.minutes)).toEqual([5, 20, 35, 50]);
  });

  test("day of week accepts 7 as Sunday and normalizes it", () => {
    expect(sorted(parseCron("0 0 * * 7").daysOfWeek)).toEqual([0]);
  });

  test("invalid expressions are rejected", () => {
    const invalid = [
      "",
      "* * * *",
      "* * * * * *",
      "60 * * * *",
      "* 24 * * *",
      "* * 0 * *",
      "* * 32 * *",
      "* * * 0 *",
      "* * * 13 *",
      "* * * * 8",
      "*/0 * * * *",
      "1-0 * * * *",
      "5-2 * * * *",
      "a * * * *",
      "1,,2 * * * *",
      "* * * * MON",
      "1-2-3 * * * *",
      "*/x * * * *",
    ];
    for (const expression of invalid) {
      expect(() => parseCron(expression)).toThrow();
    }
  });
});

describe("nextRunAt", () => {
  test("returns the next matching minute strictly after the reference instant", () => {
    const from = new Date("2026-01-05T10:07:30.000Z");
    expect(nextRunAt("*/15 * * * *", from, "UTC").toISOString()).toBe("2026-01-05T10:15:00.000Z");
    expect(nextRunAt("7 10 * * *", from, "UTC").toISOString()).toBe("2026-01-06T10:07:00.000Z");
  });

  test("rolls across month and year boundaries", () => {
    expect(nextRunAt("0 0 1 1 *", new Date("2026-02-01T00:00:00Z"), "UTC").toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  test("evaluates the wall clock in the schedule timezone", () => {
    // 2026-01-01T00:30:00Z is 07:30 in Jakarta (UTC+7).
    expect(nextRunAt("0 8 * * *", new Date("2026-01-01T00:30:00Z"), "Asia/Jakarta").toISOString()).toBe(
      "2026-01-01T01:00:00.000Z",
    );
  });

  test("day of month and day of week combine with OR when both are restricted", () => {
    // 2026-01-01 is a Thursday; the next Monday is 2026-01-05.
    expect(nextRunAt("0 0 2 * 1", new Date("2026-01-01T12:00:00Z"), "UTC").toISOString()).toBe(
      "2026-01-02T00:00:00.000Z",
    );
    expect(nextRunAt("0 0 2 * 1", new Date("2026-01-03T12:00:00Z"), "UTC").toISOString()).toBe(
      "2026-01-05T00:00:00.000Z",
    );
  });

  test("rejects an unknown timezone", () => {
    expect(() => nextRunAt("* * * * *", new Date("2026-01-01T00:00:00Z"), "Mars/Olympus")).toThrow();
  });
});
