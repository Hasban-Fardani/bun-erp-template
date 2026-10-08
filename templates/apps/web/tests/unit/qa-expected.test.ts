import { describe, expect, test } from "bun:test";
import { isExpectedConsoleError, isExpectedResponse } from "../browser/expected.ts";

const base = "http://localhost:3000";

describe("QA expected failures", () => {
  test("allows the anonymous session probe and the deliberate failed sign-in only", () => {
    expect(isExpectedResponse({ method: "GET", url: `${base}/api/v1/me`, status: 401 })).toBe(true);
    expect(isExpectedResponse({ method: "POST", url: `${base}/api/v1/auth/sign-in/email`, status: 401 })).toBe(true);
  });

  test("keeps every other >= 400 failing", () => {
    expect(isExpectedResponse({ method: "GET", url: `${base}/api/v1/me`, status: 500 })).toBe(false);
    expect(isExpectedResponse({ method: "POST", url: `${base}/api/v1/me`, status: 401 })).toBe(false);
    expect(isExpectedResponse({ method: "GET", url: `${base}/api/v1/notifications/unread-count`, status: 401 })).toBe(
      false,
    );
    expect(isExpectedResponse({ method: "GET", url: `${base}/api/v1/auth/sign-in/email`, status: 401 })).toBe(false);
    expect(isExpectedResponse({ method: "POST", url: `${base}/api/v1/auth/sign-in/email`, status: 422 })).toBe(false);
  });

  test("allows only the resource-load console error of an expected 401", () => {
    const failed = "Failed to load resource: the server responded with a status of 401 (Unauthorized)";
    expect(isExpectedConsoleError({ text: failed, locationUrl: `${base}/api/v1/me` })).toBe(true);
    expect(isExpectedConsoleError({ text: failed, locationUrl: `${base}/api/v1/auth/sign-in/email` })).toBe(true);
    expect(isExpectedConsoleError({ text: failed, locationUrl: `${base}/api/v1/users` })).toBe(false);
    expect(isExpectedConsoleError({ text: "TypeError: x is undefined", locationUrl: `${base}/api/v1/me` })).toBe(false);
    expect(isExpectedConsoleError({ text: failed.replace("401", "500"), locationUrl: `${base}/api/v1/me` })).toBe(
      false,
    );
  });
});
