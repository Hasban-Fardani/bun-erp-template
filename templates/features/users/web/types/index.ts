import type { rpc } from "@web/lib/rpc.ts";
import type { InferResponseType } from "hono/client";

export type PublicUser = InferResponseType<typeof rpc.users.$get, 200>["data"]["items"][number];
