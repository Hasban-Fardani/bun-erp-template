import { queryOptions } from "@tanstack/react-query";
import * as z from "zod";
import { ApiError } from "../../../lib/api.ts";
import { authRequest } from "../../../lib/auth.ts";
import { listParams } from "../../../lib/list-params.ts";
import { call, rpc } from "../../../lib/rpc.ts";
import type { SessionView } from "../types/index.ts";

export const userKeys = { all: ["users"] as const, list: (query: string) => ["users", query] as const };

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

export const usersQuery = (query: string) =>
  queryOptions({
    queryKey: userKeys.list(query),
    queryFn: () =>
      call(rpc.users.$get({ query: listParams(query, z.enum(["name", "email", "createdAt"]).default("name")) })),
  });

export const rolesQuery = queryOptions({
  queryKey: ["roles", "catalog"],
  queryFn: () => call(rpc.roles.$get({ query: {} })),
});
