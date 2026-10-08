import { queryOptions } from "@tanstack/react-query";
import { call, rpc } from "@web/lib/rpc.ts";

export const assistantKeys = {
  status: ["assistant", "status"] as const,
};

/** Availability and today's remaining questions; refreshed after every answer. */
export const assistantStatusQuery = queryOptions({
  queryKey: assistantKeys.status,
  queryFn: () => call(rpc.ai.status.$get()),
  staleTime: 60_000,
});
