import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";
import type { AuditLog, Role } from "./types.ts";

export function useRoleList(enabled: boolean) {
  return useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<{ items: Role[]; total: number }>("/api/v1/roles"),
    select: (d) => d.items,
    enabled,
  });
}

export function useAuditLogs(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ["audit", search],
    queryFn: () =>
      api.get<{ items: AuditLog[]; total: number }>(
        `/api/v1/audit-logs?limit=50${search ? `&event=${encodeURIComponent(search)}` : ""}`,
      ),
    enabled,
  });
}
