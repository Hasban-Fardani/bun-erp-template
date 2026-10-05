import type { InferResponseType } from "hono/client";
import type { rpc } from "../../../lib/rpc.ts";

/** One inbox row as the API returns it. */
export type Notification = InferResponseType<typeof rpc.notifications.$get, 200>["data"]["items"][number];
