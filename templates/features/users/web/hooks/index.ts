import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "@web/lib/rpc.ts";
import { rolesQuery, usersQuery } from "../api/queries.ts";

export function useUsers(query: string) {
  return useQuery(usersQuery(query));
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string; roleKey?: string }) =>
      call(rpc.users.$post({ json: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, roleKey }: { id: string; name: string; roleKey?: string }) => {
      const updated = await call(rpc.users[":id"].$patch({ param: { id }, json: { name } }));
      if (roleKey) return call(rpc.users[":id"].roles.$put({ param: { id }, json: { roleKeys: [roleKey] } }));
      return updated;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
      void queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(rpc.users[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

/** Role catalog for form options; an org lacking role.read falls back to built-in system roles. */
export function useRoles() {
  return useQuery({ ...rolesQuery, select: (data) => data.items, retry: false });
}
