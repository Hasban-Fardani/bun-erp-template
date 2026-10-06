import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import * as z from "zod";
import { listParams } from "../../../lib/list-params.ts";
import { call, rpc } from "../../../lib/rpc.ts";

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
