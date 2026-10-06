import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import * as z from "zod";
import { listParams } from "../../../lib/list-params.ts";
import { call, rpc } from "../../../lib/rpc.ts";

const adminKeys = {
  roles: (query: string) => ["roles", query] as const,
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
    placeholderData: keepPreviousData,
  });
