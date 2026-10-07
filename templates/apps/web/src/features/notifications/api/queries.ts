import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { listParams } from "@web/lib/list-params.ts";
import { call, rpc } from "@web/lib/rpc.ts";
import * as z from "zod";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (query: string) => ["notifications", "list", query] as const,
  unread: ["notifications", "unread"] as const,
};

export const notificationsQuery = (query = "") =>
  queryOptions({
    queryKey: notificationKeys.list(query),
    queryFn: () =>
      call(rpc.notifications.$get({ query: listParams(query, z.enum(["createdAt"]).default("createdAt")) })),
    placeholderData: keepPreviousData,
  });

/** The bell polls at a low rate; a focused app also refetches on window focus by default. */
export const unreadCountQuery = queryOptions({
  queryKey: notificationKeys.unread,
  queryFn: () => call(rpc.notifications["unread-count"].$get()),
  staleTime: 30_000,
  refetchInterval: 60_000,
});
