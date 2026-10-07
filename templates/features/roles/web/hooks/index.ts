import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "@web/lib/rpc.ts";
import { roleListQuery, roleStatementsQuery } from "../api/queries.ts";

export function useRoleList(query: string, enabled: boolean) {
  return useQuery({ ...roleListQuery(query), enabled });
}

export function useRoleStatements(enabled: boolean) {
  return useQuery({ ...roleStatementsQuery, enabled });
}

/** Role writes refetch catalog, audit and session so permission changes leave a visible trail. */
function useRoleMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
      void queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
}

export function useCreateRole() {
  return useRoleMutation((input: { key: string; name: string; description?: string }) =>
    call(rpc.roles.$post({ json: input })),
  );
}

export function useUpdateRole() {
  return useRoleMutation(({ id, ...input }: { id: string; name?: string; description?: string }) =>
    call(rpc.roles[":id"].$patch({ param: { id }, json: input })),
  );
}

export function useDeleteRole() {
  return useRoleMutation((id: string) => call(rpc.roles[":id"].$delete({ param: { id } })));
}

export function useSetRolePermissions() {
  return useRoleMutation(({ id, permissions }: { id: string; permissions: string[] }) =>
    call(rpc.roles[":id"].permissions.$put({ param: { id }, json: { permissions } })),
  );
}
