import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "../../../lib/api.ts";
import { authRequest } from "../../../lib/auth.ts";
import { call, rpc } from "../../../lib/rpc.ts";
import type { SessionView } from "../types/index.ts";

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async (): Promise<SessionView> => {
    if (!(await authRequest("get-session"))) return { authenticated: false, user: null, permissions: [] };
    const me = await call(rpc.me.$get()).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    });
    if (!me) return { authenticated: false, user: null, permissions: [] };
    return {
      authenticated: true,
      user: { id: me.userId, name: me.name, email: me.email },
      permissions: me.permissions,
    };
  },
  staleTime: 30_000,
});
