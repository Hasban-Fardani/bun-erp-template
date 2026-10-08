import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Skeleton } from "@bun-erp/ui/atoms/skeleton.tsx";
import { ArrowDown, RotateCcw } from "lucide-react";
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { AssistantChat, ChatFailure } from "../hooks/index.ts";
import type { SkillSummary } from "../lib/skill-menu.ts";
import { AssistantTranscript } from "./assistant-transcript.tsx";

const FAILURE_COPY = {
  limit: "assistant.error.limit",
  unavailable: "assistant.error.unavailable",
  failed: "assistant.error.failed",
} as const satisfies Record<ChatFailure, string>;

/** Within this many pixels of the end counts as "following along". */
const NEAR_BOTTOM_PX = 120;

/**
 * The scrolling transcript shared by the quick panel and the full page. It follows a growing answer
 * only while the reader is at the end; scrolled up, it stays put and offers a jump to the latest.
 */
export function ChatThread({
  chat,
  skills,
  onSuggestion,
  summaryOnly = false,
  children,
}: {
  chat: AssistantChat;
  skills: readonly SkillSummary[];
  onSuggestion: (text: string) => void;
  /** `AI_HISTORY=summary`: a reopened conversation has no turns, only a summary on the server. */
  summaryOnly?: boolean;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [away, setAway] = useState(false);
  const questions = chat.messages.filter((message) => message.role === "user").length;

  const onScroll = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const near = node.scrollHeight - node.scrollTop - node.clientHeight < NEAR_BOTTOM_PX;
    following.current = near;
    setAway(!near);
  }, []);

  // A new question always scrolls to the end, even if the reader had scrolled up before sending.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the question count is the trigger.
  useLayoutEffect(() => {
    following.current = true;
  }, [questions]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every transcript change.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !following.current) return;
    node.scrollTop = node.scrollHeight;
  }, [chat.messages, chat.failure, chat.loadingConversation]);

  const jump = () => {
    const node = scroller.current;
    if (!node) return;
    following.current = true;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    setAway(false);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        data-testid="assistant-scroller"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      >
        {chat.loadingConversation ? (
          <div
            className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5"
            data-testid="assistant-history-loading"
            aria-hidden="true"
          >
            <Skeleton className="ml-auto h-9 w-2/5 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
            <Skeleton className="ml-auto h-9 w-1/3 rounded-2xl" />
          </div>
        ) : (
          <AssistantTranscript
            messages={chat.messages}
            status={chat.status}
            skills={skills}
            onSuggestion={onSuggestion}
            onPickSkill={(skill) => chat.setSkill({ key: skill.key, title: skill.title })}
            onRegenerate={chat.regenerate}
            onEdit={chat.edit}
          />
        )}
        {summaryOnly && chat.conversationId && chat.messages.length === 0 && !chat.loadingConversation ? (
          <p className="mx-auto mb-4 w-full max-w-3xl px-4 text-[12.5px] text-ink-muted">
            {t("assistant.summaryNote")}
          </p>
        ) : null}
        {chat.loadFailed ? (
          <div
            role="alert"
            data-testid="assistant-load-error"
            className="mx-auto mb-4 w-full max-w-3xl rounded-lg bg-danger-soft px-3 py-2.5"
          >
            <p className="text-[13px] text-danger">{t("assistant.list.loadFailed")}</p>
          </div>
        ) : null}
        {chat.failure ? (
          <div role="alert" data-testid="assistant-error" className="mx-auto mb-4 w-full max-w-3xl px-4">
            <div className="rounded-lg bg-danger-soft px-3 py-2.5">
              <p className="text-[13px] text-danger">{t(FAILURE_COPY[chat.failure])}</p>
              {chat.failure === "failed" ? (
                <Button variant="ghost" className="-ml-2 mt-1 h-8" icon={RotateCcw} onClick={chat.retry}>
                  {t("assistant.retry")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {children}
      </div>
      {away && chat.messages.length > 0 ? (
        <button
          type="button"
          data-testid="assistant-jump"
          onClick={jump}
          aria-label={t("assistant.jumpToLatest")}
          className="message-in absolute bottom-3 left-1/2 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[12.5px] font-medium text-ink shadow-lg outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowDown size={14} aria-hidden="true" />
          {t("assistant.jumpToLatest")}
        </button>
      ) : null}
    </div>
  );
}
