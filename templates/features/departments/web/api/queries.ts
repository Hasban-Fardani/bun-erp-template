import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import * as z from "zod";
import { listParams } from "../../../lib/list-params.ts";
import { call, rpc } from "../../../lib/rpc.ts";

export const departmentsKeys = {
  list: (query: string) => ["departments", query] as const,
};

export const departmentsListQuery = (query: string) =>
  queryOptions({
    queryKey: departmentsKeys.list(query),
    queryFn: () =>
      call(rpc.departments.$get({ query: listParams(query, z.enum(["name", "code", "createdAt"]).default("name")) })),
    placeholderData: keepPreviousData,
  });
