export type ToolStatus = "running" | "done" | "error";

/** One event of `POST /api/v1/ai/chat` (server: features/ai/chat.ts). */
export type ChatEvent =
  | { type: "conversation"; id: string; title: string; userMessageId?: string }
  | { type: "tool"; name: string; status: ToolStatus }
  | { type: "delta"; text: string }
  | {
      type: "done";
      remaining: number;
      conversationId?: string;
      userMessageId?: string;
      assistantMessageId?: string;
    }
  | { type: "error"; message: string };

const optionalText = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

function toEvent(block: string): ChatEvent | undefined {
  let name = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (data === "") return undefined;
  const payload = JSON.parse(data) as Record<string, unknown>;
  if (name === "delta") return { type: "delta", text: String(payload.text ?? "") };
  if (name === "tool") {
    const status = payload.status;
    if (status !== "running" && status !== "done" && status !== "error") return undefined;
    return { type: "tool", name: String(payload.name ?? ""), status };
  }
  if (name === "conversation") {
    return {
      type: "conversation",
      id: String(payload.id ?? ""),
      title: String(payload.title ?? ""),
      userMessageId: optionalText(payload.userMessageId),
    };
  }
  if (name === "done") {
    return {
      type: "done",
      remaining: Number(payload.remaining ?? 0),
      conversationId: optionalText(payload.conversationId),
      userMessageId: optionalText(payload.userMessageId),
      assistantMessageId: optionalText(payload.assistantMessageId),
    };
  }
  if (name === "error") return { type: "error", message: String(payload.message ?? "") };
  return undefined;
}

/**
 * Parses the server-sent events of a chat answer; a chunk may end mid-event, so the tail waits. The
 * reader ends after `done` or `error`; every other event is part of the answer in progress.
 */
export async function* readChatEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
      const blocks = buffer.split("\n\n");
      buffer = done ? "" : (blocks.pop() ?? "");
      for (const block of blocks) {
        const event = toEvent(block);
        if (!event) continue;
        yield event;
        if (event.type === "done" || event.type === "error") return;
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
