import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { IconButton } from "@bun-erp/ui/atoms/icon-button.tsx";
import { Kbd } from "@bun-erp/ui/atoms/kbd.tsx";
import { Sheet } from "@bun-erp/ui/organisms/sheet.tsx";
import { ArrowUp, RotateCcw, Sparkles, Square } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type ChatFailure, useAssistantChat, useAssistantStatus } from "../hooks/index.ts";
import { AssistantTranscript } from "./assistant-transcript.tsx";

const FAILURE_COPY = {
  limit: "assistant.error.limit",
  unavailable: "assistant.error.unavailable",
  failed: "assistant.error.failed",
} as const satisfies Record<ChatFailure, string>;

function shortcutLabel(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘J" : "Ctrl+J";
}

/**
 * The built-in assistant: a topbar button (or ⌘/Ctrl+J) opens a side panel on desktop and a bottom
 * sheet on phones. Answers stream in word by word; the conversation lives only in this tab.
 */
export function AssistantPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [shortcut, setShortcut] = useState("Ctrl+J");
  const chat = useAssistantChat();
  const status = useAssistantStatus(open);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const streaming = chat.status === "streaming";
  const unavailable = status.data?.available === false;
  const remaining = status.data?.remaining;

  useEffect(() => setShortcut(shortcutLabel()), []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Follow the answer as it grows, unless the reader scrolled up to re-read something.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every transcript change.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (nearBottom || streaming) node.scrollTop = node.scrollHeight;
  }, [chat.messages, streaming]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (draft.trim() === "" || streaming) return;
    void chat.send(draft);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line; IME composition must not send half a word.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
  };

  return (
    <>
      <button
        type="button"
        data-testid="assistant-trigger"
        onClick={() => setOpen(true)}
        aria-label={t("assistant.open")}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-accent-soft-foreground outline-none transition-colors duration-150 ease-out hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
      >
        <Sparkles size={15} aria-hidden="true" />
        <span className="hidden md:inline">{t("assistant.title")}</span>
        <Kbd className="hidden lg:inline-flex">{shortcut}</Kbd>
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        side="right"
        title={t("assistant.title")}
        titleHidden
        className="max-w-md [&>div]:flex [&>div]:flex-col [&>div]:p-0"
      >
        <div data-testid="assistant-panel" className="flex h-full min-h-0 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <span className="flex size-7 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
              <Sparkles size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-tight text-ink">{t("assistant.title")}</p>
              {remaining !== undefined ? (
                <p data-testid="assistant-remaining" className="text-[11.5px] text-ink-muted">
                  {t("assistant.remaining", { count: remaining })}
                </p>
              ) : null}
            </div>
            {chat.messages.length > 0 ? (
              <IconButton
                icon={RotateCcw}
                label={t("assistant.newChat")}
                data-testid="assistant-reset"
                onClick={() => {
                  chat.reset();
                  input.current?.focus();
                }}
              />
            ) : null}
          </header>

          <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <AssistantTranscript
              messages={chat.messages}
              status={chat.status}
              onSuggestion={(text) => {
                setDraft(text);
                input.current?.focus();
              }}
            />
            {chat.failure ? (
              <div
                role="alert"
                data-testid="assistant-error"
                className="mx-4 mb-4 rounded-lg bg-danger-soft px-3 py-2.5"
              >
                <p className="text-[13px] text-danger">{t(FAILURE_COPY[chat.failure])}</p>
                {chat.failure === "failed" ? (
                  <Button variant="ghost" className="-ml-2 mt-1 h-7" icon={RotateCcw} onClick={chat.retry}>
                    {t("assistant.retry")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <form onSubmit={submit} className="shrink-0 border-t border-border p-3">
            {unavailable ? (
              <p data-testid="assistant-unavailable" className="mb-2 text-[12.5px] text-ink-muted">
                {t("assistant.error.unavailable")}
              </p>
            ) : null}
            <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2 transition-shadow duration-150 ease-out focus-within:ring-2 focus-within:ring-accent motion-reduce:transition-none">
              <textarea
                ref={input}
                data-testid="assistant-input"
                rows={1}
                value={draft}
                disabled={unavailable}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("assistant.placeholder")}
                aria-label={t("assistant.placeholder")}
                maxLength={4000}
                className="field-sizing-content max-h-40 min-h-6 flex-1 resize-none bg-transparent py-1 text-[13.5px] text-ink outline-none placeholder:text-ink-muted"
              />
              {streaming ? (
                <IconButton
                  icon={Square}
                  label={t("assistant.stop")}
                  data-testid="assistant-stop"
                  variant="ghost"
                  onClick={chat.stop}
                />
              ) : (
                <IconButton
                  icon={ArrowUp}
                  label={t("assistant.send")}
                  data-testid="assistant-send"
                  variant="primary"
                  type="submit"
                  disabled={draft.trim() === "" || unavailable}
                />
              )}
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-ink-muted">{t("assistant.disclaimer")}</p>
          </form>
        </div>
      </Sheet>
    </>
  );
}
