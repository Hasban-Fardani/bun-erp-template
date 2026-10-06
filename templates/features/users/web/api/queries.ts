import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import * as z from "zod";
import { listParams } from "../../../lib/list-params.ts";
import { call, rpc } from "../../../lib/rpc.ts";

const userKeys = { list: (query: string) => ["users", query] as const };

export const usersQuery = (query: string) =>
  queryOptions({
    queryKey: userKeys.list(query),
    queryFn: () =>
      call(rpc.users.$get({ query: listParams(query, z.enum(["name", "email", "createdAt"]).default("name")) })),
    placeholderData: keepPreviousData,
  });

export const rolesQuery = queryOptions({
  queryKey: ["roles", "catalog"],
  queryFn: () => call(rpc.roles.$get({ query: {} })),
});
