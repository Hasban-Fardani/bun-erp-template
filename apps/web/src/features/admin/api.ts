import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";
import type { Paged } from "../../shared/lib/list-types.ts";
import type { AuditLog, Role, RoleStatements } from "./types.ts";

export function useRoleList(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["roles", query],
    queryFn: () => api.get<Paged<Role>>(`/api/v1/roles?${query}`),
    enabled,
  });
}

/** Statement catalog from the server: the UI builds its checkboxes from here instead of copying them. */
export function useRoleStatements(enabled: boolean) {
  return useQuery({
    queryKey: ["role-statements"],
    queryFn: () => api.get<RoleStatements>("/api/v1/roles/statements"),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useAuditLogs(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["audit", query],
    queryFn: () => api.get<Paged<AuditLog>>(`/api/v1/audit-logs?${query}`),
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
    },
  });
}

export function useCreateRole() {
  return useRoleMutation((input: { key: string; name: string; description?: string }) =>
    api.post<Role>("/api/v1/roles", input),
  );
}

export function useUpdateRole() {
  return useRoleMutation(({ id, ...input }: { id: string; name?: string; description?: string }) =>
    api.patch<Role>(`/api/v1/roles/${id}`, input),
  );
}

export function useDeleteRole() {
  return useRoleMutation((id: string) => api.del<{ id: string }>(`/api/v1/roles/${id}`));
}

export function useSetRolePermissions() {
  return useRoleMutation(({ id, permissions }: { id: string; permissions: string[] }) =>
    api.put<{ permissions: string[] }>(`/api/v1/roles/${id}/permissions`, { permissions }),
  );
}
