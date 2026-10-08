import { createUuid } from "@bun-erp/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "@web/lib/rpc.ts";
import { useCallback, useRef, useState } from "react";
import { assistantKeys, assistantStatusQuery } from "../api/queries.ts";
import { readChatEvents } from "../lib/chat-stream.ts";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
export type ChatStatus = "idle" | "streaming";
/** Why the last question has no complete answer; each maps to its own copy in the panel. */
export type ChatFailure = "limit" | "unavailable" | "failed";

/** Mirrors the server's MAX_TURNS: older turns stay on screen but are not sent again. */
const MAX_TURNS = 20;

export function useAssistantStatus(enabled: boolean) {
  return useQuery({ ...assistantStatusQuery, enabled });
}

/**
 * Conversation state for the assistant panel. The transcript lives in memory only: closing the tab
 * forgets it, and the server stores no chat history.
 */
export function useAssistantChat() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const abort = useRef<AbortController | null>(null);

  /** `base` is the transcript the question follows; retry passes it without the failed question. */
  const ask = useCallback(
    async (question: string, base: ChatMessage[]) => {
      const content = question.trim();
      if (content === "" || abort.current) return;
      const asked: ChatMessage = { id: createUuid(), role: "user", content };
      const answer: ChatMessage = { id: createUuid(), role: "assistant", content: "" };
      const history = [...base, asked].slice(-MAX_TURNS);
      setMessages([...base, asked, answer]);
      setFailure(null);
      setStatus("streaming");
      const controller = new AbortController();
      abort.current = controller;

      try {
        const response = await rpc.ai.chat.$post(
          { json: { messages: history.map(({ role, content: text }) => ({ role, content: text })) } },
          { init: { signal: controller.signal } },
        );
        if (!response.ok || !response.body) {
          setFailure(response.status === 429 ? "limit" : response.status === 503 ? "unavailable" : "failed");
          return;
        }
        for await (const event of readChatEvents(response.body)) {
          if (event.type === "delta") {
            const text = event.text;
            setMessages((current) =>
              current.map((message) =>
                message.id === answer.id ? { ...message, content: message.content + text } : message,
              ),
            );
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
      }
    },
    [queryClient],
  );

  const send = useCallback((question: string) => ask(question, messages), [ask, messages]);

  const stop = useCallback(() => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    setMessages([]);
    setFailure(null);
  }, []);

  /** Asks the last question again after a failure, without duplicating it in the transcript. */
  const retry = useCallback(() => {
    const index = messages.findLastIndex((message) => message.role === "user");
    const last = messages[index];
    if (!last) return;
    void ask(last.content, messages.slice(0, index));
  }, [ask, messages]);

  return { messages, status, failure, send, stop, reset, retry };
}
