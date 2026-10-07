import type { rpc } from "@web/lib/rpc.ts";
import type { InferResponseType } from "hono/client";

/** One inbox row as the API returns it. */
export type Notification = InferResponseType<typeof rpc.notifications.$get, 200>["data"]["items"][number];
