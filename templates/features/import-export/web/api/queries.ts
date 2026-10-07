import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { listParams } from "@web/lib/list-params.ts";
import { call, rpc } from "@web/lib/rpc.ts";
import * as z from "zod";

export const importExportKeys = {
  all: ["import-export"] as const,
  resources: ["import-export", "resources"] as const,
  history: (query: string) => ["import-export", "imports", query] as const,
  progress: (id: string) => ["import-export", "imports", "progress", id] as const,
};

export const importExportResourcesQuery = () =>
  queryOptions({
    queryKey: importExportKeys.resources,
    queryFn: () => call(rpc["import-export"].resources.$get()),
    staleTime: 60_000,
  });

export const importHistoryQuery = (query: string) =>
  queryOptions({
    queryKey: importExportKeys.history(query),
    queryFn: () =>
      call(
        rpc["import-export"].imports.$get({
          query: listParams(query, z.enum(["createdAt"]).default("createdAt")),
        }),
      ),
    placeholderData: keepPreviousData,
  });

export const importProgressQuery = (id: string) =>
  queryOptions({
    queryKey: importExportKeys.progress(id),
    queryFn: () => call(rpc["import-export"].imports[":id"].$get({ param: { id } })),
  });
