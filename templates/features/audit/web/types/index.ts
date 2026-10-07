import type { rpc } from "@web/lib/rpc.ts";
import type { InferResponseType } from "hono/client";

export type AuditLog = InferResponseType<(typeof rpc)["audit-logs"]["$get"], 200>["data"]["items"][number];
