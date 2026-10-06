import type { InferResponseType } from "hono/client";
import type { rpc } from "../../../lib/rpc.ts";

/** One department row as the list endpoint returns it. */
export type Department = InferResponseType<typeof rpc.departments.$get, 200>["data"]["items"][number];
