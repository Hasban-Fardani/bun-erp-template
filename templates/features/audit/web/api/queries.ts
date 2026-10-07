import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { listParams } from "@web/lib/list-params.ts";
import { call, rpc } from "@web/lib/rpc.ts";
import * as z from "zod";

export const auditQuery = (query: string) =>
  queryOptions({
    queryKey: ["audit", query] as const,
    queryFn: () =>
      call(
        rpc["audit-logs"].$get({
          query: listParams(query, z.enum(["createdAt", "event", "actorLabel"]).default("createdAt")),
        }),
      ),
    placeholderData: keepPreviousData,
  });
