import { createUuid } from "@bun-erp/utils";
import { useQueryClient } from "@tanstack/react-query";
import { rpc } from "@web/lib/rpc.ts";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { assistantKeys, fetchConversation } from "../api/queries.ts";
import { applyChatEvent, type ChatMessage, type SkillRef } from "../lib/chat-state.ts";
import { readChatEvents } from "../lib/chat-stream.ts";

export type ChatStatus = "idle" | "streaming";
/** Why the last question has no complete answer; each maps to its own copy. */
export type ChatFailure = "limit" | "unavailable" | "failed";

/** Mirrors the server's MAX_TURNS: older turns stay on screen but are not sent again. */
const MAX_TURNS = 20;

type AskOptions = { skill?: SkillRef; replaceFrom?: string };

export type AssistantChat = {
  messages: ChatMessage[];
  status: ChatStatus;
  failure: ChatFailure | null;
  conversationId: string | null;
  /** The skill chosen for the next question; cleared once it is sent. */
  skill: SkillRef | null;
  setSkill: (skill: SkillRef | null) => void;
  loadingConversation: boolean;
  loadFailed: boolean;
  send: (question: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
  retry: () => void;
  regenerate: () => void;
  edit: (messageId: string, question: string) => void;
  openConversation: (id: string) => Promise<void>;
};

const AssistantChatContext = createContext<AssistantChat | null>(null);

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta: { skill?: string; tools?: { name: string; status: "done" | "error" }[] } | null;
};

function fromStored(message: StoredMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    stored: true,
    skill: message.meta?.skill ? { key: message.meta.skill, title: message.meta.skill } : undefined,
    tools: message.meta?.tools?.map((tool) => ({ name: tool.name, status: tool.status })),
  };
}

/**
 * One assistant conversation shared by the quick panel and the full page, so "open in full view"
 * continues exactly what was asked. The server keeps the history (docs/ai.md, `AI_HISTORY`); this
 * state is the current screen's copy of it.
 */
export function AssistantChatProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [skill, setSkill] = useState<SkillRef | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const conversationRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const adoptConversation = useCallback((id: string | null) => {
    conversationRef.current = id;
    setConversationId(id);
  }, []);

  /** `base` is the transcript the question follows; retry and edit pass it without the replaced turns. */
  const ask = useCallback(
    async (question: string, base: ChatMessage[], options: AskOptions = {}) => {
      const content = question.trim();
      if (content === "" || abort.current) return;
      const asked: ChatMessage = { id: createUuid(), role: "user", content, stored: false, skill: options.skill };
      const answer: ChatMessage = { id: createUuid(), role: "assistant", content: "", stored: false };
      const history = [...base, asked].slice(-MAX_TURNS);
      setMessages([...base, asked, answer]);
      setFailure(null);
      setStatus("streaming");
      const controller = new AbortController();
      abort.current = controller;
      let questionId = asked.id;

      try {
        const response = await rpc.ai.chat.$post(
          {
            json: {
              messages: history.map(({ role, content: text }) => ({ role, content: text })),
              ...(conversationRef.current ? { conversationId: conversationRef.current } : {}),
              ...(options.skill ? { skill: options.skill.key } : {}),
              ...(options.replaceFrom ? { replaceFrom: options.replaceFrom } : {}),
            },
          },
          { init: { signal: controller.signal } },
        );
        if (!response.ok || !response.body) {
          setFailure(response.status === 429 ? "limit" : response.status === 503 ? "unavailable" : "failed");
          return;
        }
        for await (const event of readChatEvents(response.body)) {
          const currentQuestion = questionId;
          setMessages((current) => applyChatEvent(current, currentQuestion, answer.id, event));
          if (event.type === "conversation") {
            if (event.userMessageId) questionId = event.userMessageId;
            adoptConversation(event.id);
          }
          if (event.type === "error") setFailure("failed");
          if (event.type === "done") {
            // The answer carries the new count, so the header updates without another request.
            const remaining = event.remaining;
            queryClient.setQueryData(assistantKeys.status, (current) => current && { ...current, remaining });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) setFailure("failed");
        if (!(error instanceof Error)) throw error;
      } finally {
        abort.current = null;
        setStatus("idle");
        // An empty answer bubble would read as "the assistant said nothing"; the failure copy says why.
        setMessages((current) => current.filter((message) => message.id !== answer.id || message.content !== ""));
        // A refused or failed question may still have spent quota; re-read the count from the server.
        void queryClient.invalidateQueries({ queryKey: assistantKeys.status });
        void queryClient.invalidateQueries({ queryKey: assistantKeys.conversations });
      }
    },
    [queryClient, adoptConversation],
  );

  const send = useCallback(
    async (question: string) => {
      const chosen = skill ?? undefined;
      setSkill(null);
      await ask(question, messagesRef.current, { skill: chosen });
    },
    [ask, skill],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    setMessages([]);
    setFailure(null);
    setLoadFailed(false);
    setSkill(null);
    adoptConversation(null);
  }, [adoptConversation]);

  const askAgainFrom = useCallback(
    (index: number, question: string) => {
      const current = messagesRef.current;
      const target = current[index];
      if (!target) return;
      void ask(question, current.slice(0, index), {
        skill: target.skill,
        replaceFrom: target.stored ? target.id : undefined,
      });
    },
    [ask],
  );

  /** Asks the last question again after a failure or to get a different answer. */
  const regenerate = useCallback(() => {
    const index = messagesRef.current.findLastIndex((message) => message.role === "user");
    const last = messagesRef.current[index];
    if (last) askAgainFrom(index, last.content);
  }, [askAgainFrom]);

  const edit = useCallback(
    (messageId: string, question: string) => {
      const index = messagesRef.current.findIndex((message) => message.id === messageId);
      if (index >= 0) askAgainFrom(index, question);
    },
    [askAgainFrom],
  );

  const openConversation = useCallback(
    async (id: string) => {
      if (abort.current) return;
      setLoadingConversation(true);
      setLoadFailed(false);
      try {
        const detail = await fetchConversation(id);
        setMessages(detail.messages.map((message) => fromStored(message as StoredMessage)));
        setFailure(null);
        setSkill(null);
        adoptConversation(detail.conversation.id);
      } catch {
        setLoadFailed(true);
      } finally {
        setLoadingConversation(false);
      }
    },
    [adoptConversation],
  );

  const value = useMemo<AssistantChat>(
    () => ({
      messages,
      status,
      failure,
      conversationId,
      skill,
      setSkill,
      loadingConversation,
      loadFailed,
      send,
      stop,
      reset,
      retry: regenerate,
      regenerate,
      edit,
      openConversation,
    }),
    [
      messages,
      status,
      failure,
      conversationId,
      skill,
      loadingConversation,
      loadFailed,
      send,
      stop,
      reset,
      regenerate,
      edit,
      openConversation,
    ],
  );

  return <AssistantChatContext.Provider value={value}>{children}</AssistantChatContext.Provider>;
}

export function useAssistantChat(): AssistantChat {
  const value = useContext(AssistantChatContext);
  if (!value) throw new Error("useAssistantChat must be used inside AssistantChatProvider");
  return value;
}
