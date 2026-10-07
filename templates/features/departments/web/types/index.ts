import type { rpc } from "@web/lib/rpc.ts";
import type { InferResponseType } from "hono/client";

/** One department row as the list endpoint returns it. */
export type Department = InferResponseType<typeof rpc.departments.$get, 200>["data"]["items"][number];
