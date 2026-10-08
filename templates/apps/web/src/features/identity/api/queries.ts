import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "@web/lib/api.ts";
import { call, rpc } from "@web/lib/rpc.ts";
import type { SessionView } from "../types/index.ts";
import { identityKeys } from "./keys.ts";

/**
 * One request per session read: `/me` returns the identity and permissions together, and answers
 * 401 when the cookie has no session. The old get-session call added a second round trip per page.
 */
export const sessionQuery = queryOptions({
  queryKey: identityKeys.session,
  queryFn: async (): Promise<SessionView> => {
    const me = await call(rpc.me.$get()).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    });
    if (!me) return { authenticated: false, user: null, permissions: [] };
    return {
      authenticated: true,
      user: { id: me.userId, name: me.name, email: me.email },
      permissions: me.permissions,
      impersonation: me.impersonation
        ? {
            by: { name: me.impersonation.by.name, email: me.impersonation.by.email },
            expiresAt: String(me.impersonation.expiresAt),
          }
        : null,
    };
  },
  staleTime: 30_000,
});
