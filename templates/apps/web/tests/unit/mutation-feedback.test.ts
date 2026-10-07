import { expect, test } from "bun:test";
import type { Translate } from "@bun-erp/i18n";
import { ApiError } from "../../src/lib/api.ts";
import { mutationErrorMessage } from "../../src/lib/mutation-feedback.ts";

const t: Translate = (key) => key;

test("invalid credentials keep the sign-in specific recovery copy", () => {
  expect(mutationErrorMessage(t, new ApiError(401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password"))).toBe(
    "auth.signInFailed",
  );
});

test("every other failure gets the shared action-failed message", () => {
  expect(mutationErrorMessage(t, new ApiError(409, "CONFLICT", "Duplicate"))).toBe("common.actionFailed");
  expect(mutationErrorMessage(t, new Error("Network down"))).toBe("common.actionFailed");
  expect(mutationErrorMessage(t, undefined)).toBe("common.actionFailed");
});
