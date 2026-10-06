import type { InferResponseType } from "hono/client";
import type { rpc } from "../../../lib/rpc.ts";

export type PublicUser = InferResponseType<typeof rpc.users.$get, 200>["data"]["items"][number];
