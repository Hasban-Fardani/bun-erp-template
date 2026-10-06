import type { InferResponseType } from "hono/client";
import type { rpc } from "../../../lib/rpc.ts";

export type AuditLog = InferResponseType<(typeof rpc)["audit-logs"]["$get"], 200>["data"]["items"][number];
