import type { ChatEvent, ToolStatus } from "./chat-stream.ts";

export type ToolCard = { name: string; status: ToolStatus };
export type SkillRef = { key: string; title: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** True once the server holds this turn under `id`; only stored turns can be replaced by id. */
  stored: boolean;
  skill?: SkillRef;
  tools?: ToolCard[];
};

function updateTools(tools: ToolCard[] | undefined, name: string, status: ToolStatus): ToolCard[] {
  const current = tools ?? [];
  if (status !== "running") {
    // Close the newest card still running under this name; a bare error (unknown tool) gets its own card.
    const index = current.findLastIndex((card) => card.name === name && card.status === "running");
    if (index >= 0) return current.map((card, position) => (position === index ? { name, status } : card));
  }
  return [...current, { name, status }];
}

/**
 * Folds one stream event into the transcript. `questionId` / `answerId` are the ids the two turns
 * have right now; the server's ids replace them as they arrive, so edit and regenerate can address
 * stored turns. Pure, so the streaming behaviour is testable without a browser.
 */
export function applyChatEvent(
  messages: readonly ChatMessage[],
  questionId: string,
  answerId: string,
  event: ChatEvent,
): ChatMessage[] {
  const patch = (id: string, change: (message: ChatMessage) => ChatMessage) =>
    messages.map((message) => (message.id === id ? change(message) : message));

  switch (event.type) {
    case "conversation":
      return event.userMessageId
        ? patch(questionId, (message) => ({ ...message, id: event.userMessageId as string, stored: true }))
        : [...messages];
    case "tool":
      return patch(answerId, (message) => ({
        ...message,
        tools: updateTools(message.tools, event.name, event.status),
      }));
    case "delta":
      return patch(answerId, (message) => ({ ...message, content: message.content + event.text }));
    case "done": {
      const withQuestion = event.userMessageId
        ? messages.map((message) =>
            message.id === questionId ? { ...message, id: event.userMessageId as string, stored: true } : message,
          )
        : [...messages];
      return event.assistantMessageId
        ? withQuestion.map((message) =>
            message.id === answerId ? { ...message, id: event.assistantMessageId as string, stored: true } : message,
          )
        : withQuestion;
    }
    case "error":
      return [...messages];
  }
}
