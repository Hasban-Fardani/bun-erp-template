import { expect, test } from "bun:test";
import { I18nProvider } from "@loom/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantTranscript } from "../../src/features/assistant/components/assistant-transcript.tsx";
import { readChatEvents } from "../../src/features/assistant/lib/chat-stream.ts";
import { RichText } from "../../src/features/assistant/lib/rich-text.tsx";

function body(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      // Event boundaries never match network chunks.
      controller.enqueue(bytes.slice(0, 11));
      controller.enqueue(bytes.slice(11));
      controller.close();
    },
  });
}

test("chat events are parsed across chunk boundaries", async () => {
  const events = [];
  for await (const event of readChatEvents(
    body(
      'event: delta\ndata: {"text":"Ha"}\n\nevent: delta\ndata: {"text":"lo"}\n\nevent: done\ndata: {"remaining":4}\n\n',
    ),
  )) {
    events.push(event);
  }
  expect(events).toEqual([
    { type: "delta", text: "Ha" },
    { type: "delta", text: "lo" },
    { type: "done", remaining: 4 },
  ]);
});

test("an error event ends the stream", async () => {
  const events = [];
  for await (const event of readChatEvents(body('event: error\ndata: {"message":"boom"}\n\n'))) events.push(event);
  expect(events).toEqual([{ type: "error", message: "boom" }]);
});

test("rich text renders paragraphs, lists, bold and code without raw HTML", () => {
  const html = renderToStaticMarkup(
    <RichText text={"Halo **dunia**\n\n- satu\n- `dua`\n\n1. pertama\n2. kedua\n\n<script>x</script>"} />,
  );
  expect(html).toContain("<strong>dunia</strong>");
  expect(html).toContain("<ul");
  expect(html).toContain("<code");
  expect(html).toContain("<ol");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});

test("the transcript shows suggestions when empty and the thinking state while waiting", () => {
  const empty = renderToStaticMarkup(
    <I18nProvider>
      <AssistantTranscript messages={[]} status="idle" onSuggestion={() => {}} />
    </I18nProvider>,
  );
  expect(empty).toContain('data-testid="assistant-suggestion"');

  const waiting = renderToStaticMarkup(
    <I18nProvider>
      <AssistantTranscript
        messages={[
          { id: "1", role: "user", content: "Apa itu ERP?", stored: false },
          { id: "2", role: "assistant", content: "", stored: false },
        ]}
        status="streaming"
        onSuggestion={() => {}}
      />
    </I18nProvider>,
  );
  expect(waiting).toContain("Apa itu ERP?");
  expect(waiting).toContain('data-testid="assistant-thinking"');
});
