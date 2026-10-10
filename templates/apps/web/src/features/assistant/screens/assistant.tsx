import { useI18n } from "@loom/i18n/react";
import { IconButton } from "@loom/ui/atoms/icon-button.tsx";
import { Sheet } from "@loom/ui/organisms/sheet.tsx";
import { MessageSquare, PanelLeftClose, PanelLeftOpen, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AssistantComposer } from "../components/assistant-composer.tsx";
import { ChatThread } from "../components/chat-thread.tsx";
import { ConversationList } from "../components/conversation-list.tsx";
import {
  useAssistantChat,
  useAssistantSkills,
  useAssistantStatus,
  useConversations,
  useDeleteConversation,
  useRenameConversation,
} from "../hooks/index.ts";

/**
 * The full assistant page inside the normal ERP shell: saved conversations on the left (a drawer on
 * phones), the chat in a comfortable reading column, the composer pinned to the bottom. The URL
 * carries the open conversation (`?c=`), so a reload or a shared link lands in the same place.
 */
export function AssistantScreen({
  conversationId,
  onConversationChange,
}: {
  conversationId: string | undefined;
  onConversationChange: (id: string | undefined) => void;
}) {
  const { t } = useI18n();
  const chat = useAssistantChat();
  const status = useAssistantStatus(true);
  const skills = useAssistantSkills(true);
  const conversations = useConversations();
  const rename = useRenameConversation();
  const remove = useDeleteConversation();
  const [draft, setDraft] = useState("");
  const [listOpen, setListOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const unavailable = status.data?.available === false;
  const historyOff = status.data?.history === "off";

  // The URL names a conversation this screen has not loaded yet (deep link, back button, list click).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a URL change should (re)load.
  useEffect(() => {
    if (conversationId && conversationId !== chat.conversationId) void chat.openConversation(conversationId);
  }, [conversationId]);

  // A conversation started or continued in the quick panel (or created by the first question) shows up in the URL.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new conversation id should rewrite the URL.
  useEffect(() => {
    if (chat.conversationId && chat.conversationId !== conversationId) onConversationChange(chat.conversationId);
  }, [chat.conversationId]);

  const startNew = () => {
    chat.reset();
    onConversationChange(undefined);
    input.current?.focus();
  };

  const list = (onDone?: () => void) => (
    <ConversationList
      state={conversations.isPending ? "loading" : conversations.isError ? "error" : "ready"}
      items={conversations.data?.items ?? []}
      activeId={chat.conversationId}
      historyOff={historyOff}
      onOpen={(id) => {
        if (chat.status === "streaming" || id === chat.conversationId) return;
        onConversationChange(id);
      }}
      onNew={startNew}
      onRename={(id, title) => rename.mutate({ id, title })}
      onDelete={(id) =>
        remove.mutate(id, {
          onSuccess: () => {
            if (id === chat.conversationId) startNew();
          },
        })
      }
      onRetry={() => void conversations.refetch()}
      onDone={onDone}
    />
  );

  return (
    <div data-testid="assistant-page" className="flex h-[calc(100dvh-3.5rem)] min-h-0">
      {listOpen ? (
        <aside
          data-testid="assistant-list"
          aria-label={t("assistant.list.title")}
          className="hidden w-72 shrink-0 border-r border-border bg-surface md:block"
        >
          {list()}
        </aside>
      ) : null}

      <Sheet
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={t("assistant.list.title")}
        titleHidden
        side="left"
        className="w-72 [&>div]:flex [&>div]:flex-col [&>div]:p-0"
      >
        <div className="h-full min-h-0" data-testid="assistant-list-drawer">
          {list(() => setDrawerOpen(false))}
        </div>
      </Sheet>

      <section aria-label={t("assistant.page.title")} className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
          <IconButton
            icon={MessageSquare}
            label={t("assistant.list.open")}
            data-testid="assistant-list-toggle-mobile"
            className="md:hidden"
            onClick={() => setDrawerOpen(true)}
          />
          <IconButton
            icon={listOpen ? PanelLeftClose : PanelLeftOpen}
            label={listOpen ? t("assistant.list.close") : t("assistant.list.open")}
            data-testid="assistant-list-toggle"
            className="hidden md:inline-flex"
            onClick={() => setListOpen((previous) => !previous)}
          />
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
            <Sparkles size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[14px] font-semibold leading-tight text-ink">{t("assistant.page.title")}</h1>
            {status.data ? (
              <p data-testid="assistant-remaining" className="truncate text-[11.5px] text-ink-muted">
                {t("assistant.remaining", { count: status.data.remaining })}
              </p>
            ) : null}
          </div>
          {chat.messages.length > 0 ? (
            <IconButton
              icon={RotateCcw}
              label={t("assistant.newChat")}
              data-testid="assistant-reset"
              onClick={startNew}
            />
          ) : null}
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
          autoFocus
        />
      </section>
    </div>
  );
}
