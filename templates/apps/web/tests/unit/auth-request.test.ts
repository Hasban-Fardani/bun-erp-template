import { afterEach, expect, test } from "bun:test";
import { ApiError } from "../../src/lib/api.ts";
import { authRequest } from "../../src/lib/auth.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("authRequest rejects with a typed ApiError that preserves status, code and message", async () => {
  globalThis.fetch = (async () =>
    Response.json(
      { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" },
      { status: 401 },
    )) as unknown as typeof fetch;

  const error = await authRequest("sign-in/email", { email: "a@example.test", password: "wrong" }).catch(
    (reason: unknown) => reason,
  );

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 401,
    code: "INVALID_EMAIL_OR_PASSWORD",
    message: "Invalid email or password",
  });
});

test("authRequest falls back to English diagnostic copy when the failure body is not JSON", async () => {
  globalThis.fetch = (async () => new Response("<html>bad gateway</html>", { status: 502 })) as unknown as typeof fetch;

  const error = (await authRequest("sign-out").catch((reason: unknown) => reason)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(502);
  expect(error.code).toBe("AUTH_REQUEST_FAILED");
  expect(error.message).not.toContain("Permintaan");
});
