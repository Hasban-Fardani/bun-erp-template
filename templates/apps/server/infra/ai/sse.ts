/**
 * Yields the `data:` payload of every server-sent event until `[DONE]`. Network chunks never line
 * up with events, so a partial line is kept until its newline arrives.
 */
export async function* readSseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        if (data !== "") yield data;
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Reads an OpenAI-style `chat.completion.chunk` stream; Workers AI's REST endpoint speaks it too. */
export async function* readOpenAiDeltas(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const data of readSseData(stream)) {
    const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[] };
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}
