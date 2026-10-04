import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as z from "zod";
import { ApiError } from "../../lib/api.ts";
import { authRequest } from "../../lib/auth.ts";
import { listParams } from "../../lib/list-params.ts";
import { call, rpc } from "../../lib/rpc.ts";
import type { SessionView } from "./types.ts";

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
export function useSession() {
  return useQuery(sessionQuery);
}

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

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => authRequest("sign-in/email", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
}

export function useUsers(query: string) {
  return useQuery(usersQuery(query));
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string; roleKey?: string }) =>
      call(rpc.users.$post({ json: input })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, roleKey }: { id: string; name: string; roleKey?: string }) => {
      const updated = await call(rpc.users[":id"].$patch({ param: { id }, json: { name } }));
      // Replacement revokes old organisation roles atomically while preserving scoped assignments.
      if (roleKey) return call(rpc.users[":id"].roles.$put({ param: { id }, json: { roleKeys: [roleKey] } }));
      return updated;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
      void qc.invalidateQueries({ queryKey: ["session"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(rpc.users[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

/** Role catalog for form options; an org lacking role.read falls back to built-in system roles. */
export function useRoles() {
  return useQuery({
    ...rolesQuery,
    select: (d) => d.items,
    retry: false,
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      await authRequest("sign-out");
    },
    onSuccess: () => {
      qc.clear();
      void navigate({ to: "/login" });
    },
  });
}
