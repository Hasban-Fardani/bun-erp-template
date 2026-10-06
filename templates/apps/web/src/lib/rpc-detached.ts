/**
 * Detached web shell (Q30): the server app is not installed, so there is no typed RPC contract to
 * bind. `bun erp init --apps server,web --yes` re-fits the real `hc<AppType>` client and removes
 * the detached marker. Re-fit marker: detached-shell.
 */
import type { ClientResponse } from "hono/client";
import { API_BASE } from "../config/env.ts";

export { call } from "./rpc-call.ts";

type Meta = { requestId: string };
type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};
type MeResponse = { data: { userId: string; name: string; email: string; permissions: string[] }; meta: Meta };
type NotificationListResponse = { data: { items: NotificationRow[] }; meta: Meta };
type UnreadCountResponse = { data: { count: number }; meta: Meta };
type MutationResponse = { data: { updated: number }; meta: Meta };

function unavailable(): never {
  throw new Error(
    `The server app is not installed; run \`bun erp init --apps server,web --yes\` to enable ${API_BASE}/api/v1.`,
  );
}

type Endpoint<T> = (args?: unknown) => Promise<ClientResponse<T, 200, "json">>;

/** Same route surface the shell screens call; every call fails with the init pointer until re-fit. */
export const rpc = {
  me: { $get: unavailable as unknown as Endpoint<MeResponse> },
  notifications: {
    $get: unavailable as unknown as Endpoint<NotificationListResponse>,
    "unread-count": { $get: unavailable as unknown as Endpoint<UnreadCountResponse> },
    ":id": { read: { $post: unavailable as unknown as Endpoint<MutationResponse> } },
    "read-all": { $post: unavailable as unknown as Endpoint<MutationResponse> },
  },
};
