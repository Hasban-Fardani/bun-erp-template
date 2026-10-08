/** One event of `POST /api/v1/ai/chat` (server: features/ai/route.ts). */
export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "done"; remaining: number }
  | { type: "error"; message: string };

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
  if (name === "done") return { type: "done", remaining: Number(payload.remaining ?? 0) };
  if (name === "error") return { type: "error", message: String(payload.message ?? "") };
  return undefined;
}

/** Parses the server-sent events of a chat answer; a chunk may end mid-event, so the tail waits. */
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
        if (event.type !== "delta") return;
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
