import { useI18n } from "@loom/i18n/react";
import { IconButton } from "@loom/ui/atoms/icon-button.tsx";
import { Kbd } from "@loom/ui/atoms/kbd.tsx";
import { Sheet } from "@loom/ui/organisms/sheet.tsx";
import { Link, useLocation } from "@tanstack/react-router";
import { Maximize2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAssistantChat, useAssistantSkills, useAssistantStatus } from "../hooks/index.ts";
import { AssistantComposer } from "./assistant-composer.tsx";
import { ChatThread } from "./chat-thread.tsx";

function shortcutLabel(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘J" : "Ctrl+J";
}

/**
 * The quick assistant: a topbar button (or ⌘/Ctrl+J) opens a side panel on desktop and a bottom
 * sheet on phones. It shares its conversation with the full page, so "open in full view" continues
 * exactly what was asked here.
 */
export function AssistantPanel() {
  const { t } = useI18n();
  const location = useLocation();
  const onFullPage = location.pathname === "/assistant";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [shortcut, setShortcut] = useState("Ctrl+J");
  const chat = useAssistantChat();
  const status = useAssistantStatus(open);
  const skills = useAssistantSkills(open);
  const input = useRef<HTMLTextAreaElement>(null);
  const unavailable = status.data?.available === false;
  const remaining = status.data?.remaining;

  useEffect(() => setShortcut(shortcutLabel()), []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        // The full page already is the assistant: the shortcut jumps to its message box instead.
        if (onFullPage) {
          document.querySelector<HTMLTextAreaElement>('[data-testid="assistant-input"]')?.focus();
          return;
        }
        setOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onFullPage]);

  return (
    <>
      {onFullPage ? null : (
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
      )}

      <Sheet
        open={open && !onFullPage}
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
            <Link
              to="/assistant"
              search={chat.conversationId ? { c: chat.conversationId } : {}}
              data-testid="assistant-open-full"
              onClick={() => setOpen(false)}
              aria-label={t("assistant.openFull")}
              title={t("assistant.openFull")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-soft outline-none transition-colors hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent sm:size-8"
            >
              <Maximize2 size={15} aria-hidden="true" />
            </Link>
          </header>

          <ChatThread
            chat={chat}
            skills={skills.data ?? []}
            summaryOnly={status.data?.history === "summary"}
            onSuggestion={(text) => {
              setDraft(text);
              input.current?.focus();
            }}
          />

          <AssistantComposer
            draft={draft}
            onDraftChange={setDraft}
            skills={skills.data ?? []}
            skill={chat.skill}
            onSkillChange={chat.setSkill}
            streaming={chat.status === "streaming"}
            unavailable={unavailable}
            onSend={(text) => void chat.send(text)}
            onStop={chat.stop}
            inputRef={input}
          />
        </div>
      </Sheet>
    </>
  );
}
