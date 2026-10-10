import type { AppType } from "@loom/server/app-type";
import { createUuid } from "@loom/utils";
import { hc } from "hono/client";
import { API_BASE } from "../config/env.ts";

export { call } from "./rpc-call.ts";

export const rpc = hc<AppType>(API_BASE, {
  init: { credentials: "include" },
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("X-Request-Id", createUuid());
    return fetch(input, { ...init, headers });
  },
}).api.v1;
