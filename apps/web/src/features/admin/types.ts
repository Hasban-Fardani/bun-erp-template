import type { InferResponseType } from "hono/client";
import type { rpc } from "../../lib/rpc.ts";

export type Role = InferResponseType<typeof rpc.roles.$get, 200>["data"]["items"][number];
export type RoleStatements = InferResponseType<typeof rpc.roles.statements.$get, 200>["data"];
export type AuditLog = InferResponseType<(typeof rpc)["audit-logs"]["$get"], 200>["data"]["items"][number];
