import type { AppType, RpcError } from "@bun-erp/server/app-type";
import { createUuid } from "@bun-erp/utils";
import { hc } from "hono/client";
import { ApiError } from "./api.ts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export const rpc = hc<AppType>(API_BASE, {
  init: { credentials: "include" },
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("X-Request-Id", createUuid());
    return fetch(input, { ...init, headers });
  },
}).api.v1;

/** Error envelopes are part of the server contract, including field-level validation. */
export async function call<T>(
  pending: Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    json(): Promise<{ data: T; meta: { requestId: string } } | RpcError>;
  }>,
): Promise<T> {
  const response = await pending;
  const body = await response.json();
  if ("error" in body) throw new ApiError(response.status, body.error.code, body.error.message, body.error.fields);
  if (!response.ok) throw new ApiError(response.status, "UNKNOWN", response.statusText);
  return body.data;
}
