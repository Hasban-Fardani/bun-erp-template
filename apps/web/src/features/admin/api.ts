import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";
import { listParams } from "../../lib/list-params.ts";
import { call, rpc } from "../../lib/rpc.ts";

export const adminKeys = {
  roles: (query: string) => ["roles", query] as const,
  audit: (query: string) => ["audit", query] as const,
  statements: ["role-statements"] as const,
};

export const roleStatementsQuery = queryOptions({
  queryKey: adminKeys.statements,
  queryFn: () => call(rpc.roles.statements.$get()),
  staleTime: 5 * 60_000,
});

export const roleListQuery = (query: string) =>
  queryOptions({
    queryKey: adminKeys.roles(query),
    queryFn: () =>
      call(rpc.roles.$get({ query: listParams(query, z.enum(["key", "name", "isSystem"]).default("key")) })),
  });
export const auditQuery = (query: string) =>
  queryOptions({
    queryKey: adminKeys.audit(query),
    queryFn: () =>
      call(
        rpc["audit-logs"].$get({
          query: listParams(query, z.enum(["createdAt", "event", "actorLabel"]).default("createdAt")),
        }),
      ),
  });

export function useRoleList(query: string, enabled: boolean) {
  return useQuery({
    ...roleListQuery(query),
    enabled,
  });
}

/** Statement catalog from the server: the UI builds its checkboxes from here instead of copying them. */
export function useRoleStatements(enabled: boolean) {
  return useQuery({
    ...roleStatementsQuery,
    enabled,
  });
}

export function useAuditLogs(query: string, enabled: boolean) {
  return useQuery({
    ...auditQuery(query),
    enabled,
  });
}

/** Every role mutation refetches catalog + audit: permission changes must leave a visible trail. */
function useRoleMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["roles"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
      void qc.invalidateQueries({ queryKey: ["session"] });
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
