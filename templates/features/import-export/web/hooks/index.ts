import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "@web/lib/rpc.ts";
import {
  importExportKeys,
  importExportResourcesQuery,
  importHistoryQuery,
  importProgressQuery,
} from "../api/queries.ts";

export function useImportExportResources() {
  return useQuery(importExportResourcesQuery());
}

export function useImportHistory(query: string) {
  return useQuery(importHistoryQuery(query));
}

/** Polls only while a batch is still waiting or running. */
export function useImportProgress(id: string | null) {
  return useQuery({
    ...importProgressQuery(id ?? ""),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 1_500 : false;
    },
  });
}

/** What the browser parsed: headers plus string rows. */
export type ImportPayload = { resource: string; headers: string[]; rows: string[][] };

/** Dry run: validate rows without writing anything. */
export function useImportDryRun() {
  return useMutation({
    mutationFn: (payload: ImportPayload) => call(rpc["import-export"].imports["dry-run"].$post({ json: payload })),
  });
}

/** Confirm: creates the batch and returns its progress handle. */
export function useStartImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ImportPayload) => call(rpc["import-export"].imports.$post({ json: payload })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: importExportKeys.all }),
  });
}

export function useCancelImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(rpc["import-export"].imports[":id"].cancel.$post({ param: { id } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: importExportKeys.all }),
  });
}

export function useResumeImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(rpc["import-export"].imports[":id"].resume.$post({ param: { id } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: importExportKeys.all }),
  });
}
