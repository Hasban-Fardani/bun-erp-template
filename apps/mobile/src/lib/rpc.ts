import type { AppType } from "@bun-erp/server/app-type";
import { createUuid } from "@bun-erp/utils";
import { hc } from "hono/client";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export const rpc = hc<AppType>(API_BASE, {
  init: { credentials: "include" },
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("X-Request-Id", createUuid());
    return fetch(input, { ...init, headers });
  },
}).api.v1;
