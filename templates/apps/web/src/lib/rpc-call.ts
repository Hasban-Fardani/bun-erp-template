import { ApiError, type ApiErrorBody } from "./api.ts";

/** Error envelopes are part of the server contract, including field-level validation. */
export async function call<T>(
  pending: Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    json(): Promise<{ data: T; meta: { requestId: string } } | ApiErrorBody>;
  }>,
): Promise<T> {
  const response = await pending;
  const body = await response.json();
  if ("error" in body) throw new ApiError(response.status, body.error.code, body.error.message, body.error.fields);
  if (!response.ok) throw new ApiError(response.status, "UNKNOWN", response.statusText);
  return body.data;
}
