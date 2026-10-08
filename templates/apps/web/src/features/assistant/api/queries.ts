import { queryOptions } from "@tanstack/react-query";
import { call, rpc } from "@web/lib/rpc.ts";

export const assistantKeys = {
  status: ["assistant", "status"] as const,
  skills: ["assistant", "skills"] as const,
  conversations: ["assistant", "conversations"] as const,
};

/** Availability, today's remaining questions and the history mode; refreshed after every answer. */
export const assistantStatusQuery = queryOptions({
  queryKey: assistantKeys.status,
  queryFn: () => call(rpc.ai.status.$get()),
  staleTime: 60_000,
});

/** The skills this account may pick with `/`; they change only with a deploy or a role edit. */
export const assistantSkillsQuery = queryOptions({
  queryKey: assistantKeys.skills,
  queryFn: () => call(rpc.ai.skills.$get()),
  staleTime: 5 * 60_000,
});

/** Newest conversations first; the sidebar list shows the latest page only. */
export const conversationsQuery = queryOptions({
  queryKey: assistantKeys.conversations,
  queryFn: () => call(rpc.ai.conversations.$get({ query: { perPage: "50" } })),
  staleTime: 15_000,
});

export function fetchConversation(id: string) {
  return call(rpc.ai.conversations[":id"].$get({ param: { id } }));
}

export function renameConversation(id: string, title: string) {
  return call(rpc.ai.conversations[":id"].$patch({ param: { id }, json: { title } }));
}

export function removeConversation(id: string) {
  return call(rpc.ai.conversations[":id"].$delete({ param: { id } }));
}
