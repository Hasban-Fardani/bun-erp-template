import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assistantKeys,
  assistantSkillsQuery,
  assistantStatusQuery,
  conversationsQuery,
  removeConversation,
  renameConversation,
} from "../api/queries.ts";

export {
  type AssistantChat,
  AssistantChatProvider,
  type ChatFailure,
  type ChatStatus,
  useAssistantChat,
} from "./chat-context.tsx";

export function useAssistantStatus(enabled: boolean) {
  return useQuery({ ...assistantStatusQuery, enabled });
}

export function useAssistantSkills(enabled: boolean) {
  return useQuery({ ...assistantSkillsQuery, enabled });
}

export function useConversations(enabled = true) {
  return useQuery({ ...conversationsQuery, enabled });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assistantKeys.conversations }),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeConversation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assistantKeys.conversations }),
  });
}
