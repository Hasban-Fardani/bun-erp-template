import { expect, test } from "bun:test";
import { I18nProvider } from "@bun-erp/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { navGroups } from "../../src/config/navigation.ts";
import { AssistantTranscript } from "../../src/features/assistant/components/assistant-transcript.tsx";
import { ConversationList } from "../../src/features/assistant/components/conversation-list.tsx";
import { SkillMenu } from "../../src/features/assistant/components/skill-menu.tsx";
import { applyChatEvent, type ChatMessage } from "../../src/features/assistant/lib/chat-state.ts";
import { readChatEvents } from "../../src/features/assistant/lib/chat-stream.ts";
import { RichText } from "../../src/features/assistant/lib/rich-text.tsx";
import { filterSkills, matchSkillQuery, moveIndex } from "../../src/features/assistant/lib/skill-menu.ts";

const skills = [
  { key: "summarize", title: "Summarize", description: "Condense text" },
  { key: "write-email", title: "Write an email", description: "Draft an email" },
  { key: "translate", title: "Translate", description: "Between Indonesian and English" },
];

function body(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 13));
      controller.enqueue(bytes.slice(13));
      controller.close();
    },
  });
}

const wrap = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

test("the stream reader passes conversation and tool events through and ends at done", async () => {
  const events = [];
  for await (const event of readChatEvents(
    body(
      [
        'event: conversation\ndata: {"id":"c1","title":"Halo","userMessageId":"m1"}\n\n',
        'event: tool\ndata: {"name":"unread_notifications","status":"running"}\n\n',
        'event: tool\ndata: {"name":"unread_notifications","status":"done"}\n\n',
        'event: delta\ndata: {"text":"Ada 2."}\n\n',
        'event: done\ndata: {"remaining":3,"conversationId":"c1","userMessageId":"m1","assistantMessageId":"m2"}\n\n',
      ].join(""),
    ),
  )) {
    events.push(event);
  }
  expect(events.map((event) => event.type)).toEqual(["conversation", "tool", "tool", "delta", "done"]);
  expect(events.at(-1)).toEqual({
    type: "done",
    remaining: 3,
    conversationId: "c1",
    userMessageId: "m1",
    assistantMessageId: "m2",
  });
});

test("chat state applies events to the answer: text grows, tool cards update, ids become server ids", () => {
  const start: ChatMessage[] = [
    { id: "q", role: "user", content: "Berapa notifikasi?", stored: false },
    { id: "a", role: "assistant", content: "", stored: false },
  ];
  let state = applyChatEvent(start, "q", "a", { type: "conversation", id: "c1", title: "t", userMessageId: "m1" });
  expect(state[0]).toMatchObject({ id: "m1", stored: true });
  state = applyChatEvent(state, "m1", "a", { type: "tool", name: "unread_notifications", status: "running" });
  expect(state[1]?.tools).toEqual([{ name: "unread_notifications", status: "running" }]);
  state = applyChatEvent(state, "m1", "a", { type: "tool", name: "unread_notifications", status: "done" });
  expect(state[1]?.tools).toEqual([{ name: "unread_notifications", status: "done" }]);
  state = applyChatEvent(state, "m1", "a", { type: "tool", name: "ghost", status: "error" });
  expect(state[1]?.tools?.at(-1)).toEqual({ name: "ghost", status: "error" });
  state = applyChatEvent(state, "m1", "a", { type: "delta", text: "Ada " });
  state = applyChatEvent(state, "m1", "a", { type: "delta", text: "dua." });
  expect(state[1]?.content).toBe("Ada dua.");
  state = applyChatEvent(state, "m1", "a", {
    type: "done",
    remaining: 1,
    conversationId: "c1",
    userMessageId: "m1",
    assistantMessageId: "m2",
  });
  expect(state[1]).toMatchObject({ id: "m2", stored: true });
});

test("the skill menu opens only for a leading slash and filters by key or title", () => {
  expect(matchSkillQuery("/")).toBe("");
  expect(matchSkillQuery("/tra")).toBe("tra");
  expect(matchSkillQuery("hello /x")).toBeNull();
  expect(matchSkillQuery("/translate this")).toBeNull();
  expect(filterSkills(skills, "").map((s) => s.key)).toEqual(["summarize", "write-email", "translate"]);
  expect(filterSkills(skills, "mail").map((s) => s.key)).toEqual(["write-email"]);
  expect(filterSkills(skills, "TRANS").map((s) => s.key)).toEqual(["translate"]);
  expect(filterSkills(skills, "zzz")).toEqual([]);
});

test("arrow keys wrap around the skill menu", () => {
  expect(moveIndex(0, 3, "down")).toBe(1);
  expect(moveIndex(2, 3, "down")).toBe(0);
  expect(moveIndex(0, 3, "up")).toBe(2);
  expect(moveIndex(0, 0, "down")).toBe(0);
});

test("the skill menu is an accessible listbox with the active option marked", () => {
  const html = wrap(<SkillMenu id="menu" skills={skills} activeIndex={1} onPick={() => {}} onHover={() => {}} />);
  expect(html).toContain('role="listbox"');
  expect(html.match(/role="option"/g)).toHaveLength(3);
  expect(html).toContain('id="menu-option-1"');
  expect(html).toMatch(/id="menu-option-1"[^>]*aria-selected="true"/);
  expect(html).toMatch(/id="menu-option-0"[^>]*aria-selected="false"/);
});

test("rich text renders fenced code with a copy button, tables, headings and safe links", () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <RichText
        text={[
          "## Judul",
          "",
          "Lihat [dokumen](https://example.com/a) dan [bahaya](javascript:alert(1)).",
          "",
          "```ts",
          "const a = 1 < 2;",
          "```",
          "",
          "| Nama | Qty |",
          "| --- | ---: |",
          "| Pena | 3 |",
        ].join("\n")}
      />
    </I18nProvider>,
  );
  expect(html).toContain("<h3");
  expect(html).toContain('href="https://example.com/a"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('target="_blank"');
  expect(html).not.toContain("javascript:");
  expect(html).toContain("const a = 1 &lt; 2;");
  expect(html).toContain('data-testid="code-copy"');
  expect(html).toContain("<table");
  expect(html).toContain("<th");
  expect(html).toContain("Pena");
});

test("an unfinished code fence while streaming still renders as code", () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <RichText text={"Berikut:\n\n```sql\nselect 1"} />
    </I18nProvider>,
  );
  expect(html).toContain("select 1");
  expect(html).toContain("<pre");
});

test("the transcript shows tool cards, the skill chip, answer actions and the streaming caret", () => {
  const messages: ChatMessage[] = [
    {
      id: "q",
      role: "user",
      content: "Berapa notifikasi?",
      stored: true,
      skill: { key: "summarize", title: "Summarize" },
    },
    {
      id: "a",
      role: "assistant",
      content: "Ada dua.",
      stored: true,
      tools: [{ name: "unread_notifications", status: "done" }],
    },
  ];
  const idle = wrap(
    <AssistantTranscript
      messages={messages}
      status="idle"
      skills={skills}
      onSuggestion={() => {}}
      onRegenerate={() => {}}
      onEdit={() => {}}
    />,
  );
  expect(idle).toContain('data-testid="assistant-tool"');
  expect(idle).toContain('data-testid="assistant-skill-chip"');
  expect(idle).toContain('data-testid="assistant-copy"');
  expect(idle).toContain('data-testid="assistant-regenerate"');
  expect(idle).toContain('data-testid="assistant-edit"');
  expect(idle).not.toContain("stream-caret");

  const streaming = wrap(
    <AssistantTranscript
      messages={messages}
      status="streaming"
      skills={skills}
      onSuggestion={() => {}}
      onRegenerate={() => {}}
      onEdit={() => {}}
    />,
  );
  expect(streaming).toContain("stream-caret");
  expect(streaming).not.toContain('data-testid="assistant-regenerate"');
});

test("the empty transcript offers the skills as starting points", () => {
  const html = wrap(<AssistantTranscript messages={[]} status="idle" skills={skills} onSuggestion={() => {}} />);
  expect(html).toContain('data-testid="assistant-skill-suggestion"');
  expect(html).toContain("Summarize");
});

test("the conversation list shows skeletons while loading, an empty note, and items", () => {
  const loading = wrap(
    <ConversationList
      state="loading"
      items={[]}
      activeId={null}
      onOpen={() => {}}
      onNew={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(loading).toContain('data-testid="conversation-skeleton"');
  const items = wrap(
    <ConversationList
      state="ready"
      items={[
        {
          id: "c1",
          title: "Stok opname",
          summary: null,
          createdAt: "2026-10-08T00:00:00Z",
          updatedAt: "2026-10-08T00:00:00Z",
        },
      ]}
      activeId="c1"
      onOpen={() => {}}
      onNew={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(items).toContain("Stok opname");
  expect(items).toContain('aria-current="true"');
  const empty = wrap(
    <ConversationList
      state="ready"
      items={[]}
      activeId={null}
      onOpen={() => {}}
      onNew={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(empty).toContain('data-testid="conversation-empty"');
});

test("navigation carries an assistant entry gated by ai.use", () => {
  const item = navGroups.flatMap((group) => group.items).find((entry) => entry.url === "/assistant");
  expect(item?.permission).toBe("ai.use");
});
