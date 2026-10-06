import { describe, expect, test } from "bun:test";
import { isSafeLinkUrl } from "../src/is-safe-link-url";

describe("isSafeLinkUrl", () => {
  test("accepts common safe link forms", () => {
    for (const value of [
      "https://example.com/docs",
      "mailto:team@example.com",
      "tel:+15551234567",
      "/customers/42",
      "../settings",
      "#billing",
    ]) {
      expect(isSafeLinkUrl(value)).toBe(true);
    }
  });

  test("rejects executable, data, empty, and control-character URLs", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "",
      "https://example.com/\njavascript:alert(1)",
    ]) {
      expect(isSafeLinkUrl(value)).toBe(false);
    }
  });
});
