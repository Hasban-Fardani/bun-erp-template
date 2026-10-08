import { API_BASE } from "../config/env.ts";
import { ApiError } from "./api.ts";

type AuthPath = "sign-in/email" | "sign-in/social" | "sign-out" | "request-password-reset" | "reset-password";

type AuthErrorBody = { code?: unknown; message?: unknown };

/** Better Auth failures are plain `{ code, message }` bodies; anything else stays diagnostic English. */
function readAuthError(body: unknown): { code: string; message: string } {
  const record = (body ?? {}) as AuthErrorBody;
  return {
    code: typeof record.code === "string" ? record.code : "AUTH_REQUEST_FAILED",
    message: typeof record.message === "string" ? record.message : "Authentication request failed",
  };
}

/**
 * Better Auth owns these endpoints; they do not expose an application RPC schema. Failures still
 * become `ApiError` so the query client's 401 handling sees them as session state, not a crash.
 */
export async function authRequest(path: AuthPath, input?: unknown): Promise<unknown> {
  const response = await fetch(`${API_BASE}/api/v1/auth/${path}`, {
    method: "POST",
    credentials: "include",
    ...(input === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { code, message } = readAuthError(body);
    throw new ApiError(response.status, code, message);
  }
  return body;
}
