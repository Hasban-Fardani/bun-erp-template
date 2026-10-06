import { useQuery } from "@tanstack/react-query";
import { auditQuery } from "../api/queries.ts";

export function useAuditLogs(query: string, enabled: boolean) {
  return useQuery({ ...auditQuery(query), enabled });
}
