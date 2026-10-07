import type { rpc } from "@web/lib/rpc.ts";
import type { InferResponseType } from "hono/client";

export type Role = InferResponseType<typeof rpc.roles.$get, 200>["data"]["items"][number];
