import type { InferResponseType } from "hono/client";
import type { rpc } from "../../../lib/rpc.ts";

export type Role = InferResponseType<typeof rpc.roles.$get, 200>["data"]["items"][number];
