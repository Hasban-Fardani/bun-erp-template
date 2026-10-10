import { useI18n } from "@loom/i18n/react";
import { Button } from "@loom/ui/atoms/button.tsx";
import { Bubble, BubbleContent } from "@loom/ui/molecules/bubble.tsx";
import { cn } from "@web/lib/cn.ts";
import { AlertCircle, Check, Loader2, Pencil, RefreshCw, Slash, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ChatStatus } from "../hooks/index.ts";
import type { ChatMessage, ToolCard } from "../lib/chat-state.ts";
import { RichText } from "../lib/rich-text.tsx";
import type { SkillSummary } from "../lib/skill-menu.ts";
import { CopyButton } from "./copy-button.tsx";

const SUGGESTIONS = [
  "assistant.suggestion.explain",
  "assistant.suggestion.write",
  "assistant.suggestion.summarize",
] as const;

/** Tool names with their own copy; any other tool falls back to the generic wording. */
const KNOWN_TOOLS = new Set(["unread_notifications", "find_users"]);

/** Three dots that pulse while the first words are on their way; static under reduced motion. */
function Thinking() {
  const { t } = useI18n();
  return (
    <span data-testid="assistant-thinking" role="status" className="flex items-center gap-1 py-1">
      <span className="sr-only">{t("assistant.thinking")}</span>
      {[0, 1, 2].map((dot) => (
        <span key={dot} aria-hidden="true" className="typing-dot size-1.5 rounded-full bg-ink-muted" />
      ))}
    </span>
  );
}

function ToolCardView({ card }: { card: ToolCard }) {
  const { t } = useI18n();
  const name = KNOWN_TOOLS.has(card.name) ? card.name : "generic";
  const label = t(`assistant.tool.${card.status}.${name}` as Parameters<typeof t>[0]);
  const Icon = card.status === "running" ? Loader2 : card.status === "done" ? Check : AlertCircle;
  return (
    <div
      data-testid="assistant-tool"
      data-status={card.status}
      role="status"
      className={cn(
        "flex w-fit max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]",
        card.status === "error"
          ? "border-danger/30 bg-danger-soft text-danger"
          : "border-border bg-surface text-ink-soft",
      )}
    >
      <Icon
        size={14}
        aria-hidden="true"
        className={cn("shrink-0", card.status === "running" && "motion-safe:animate-spin")}
      />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function SkillChip({ title }: { title: string }) {
  const { t } = useI18n();
  return (
    <span
      data-testid="assistant-skill-chip"
      className="inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent-soft-foreground"
    >
      <Slash size={11} aria-hidden="true" />
      <span className="truncate">{t("assistant.skill.active", { title })}</span>
    </span>
  );
}

function EditForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(initial);
  return (
    <form
      className="w-full max-w-xl space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() !== "") onSave(text);
      }}
    >
      <textarea
        // biome-ignore lint/a11y/noAutofocus: the field appears because the user asked to edit.
        autoFocus
        data-testid="assistant-edit-input"
        value={text}
        maxLength={4000}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (text.trim() !== "") onSave(text);
          }
        }}
        aria-label={t("assistant.editLabel")}
        className="field-sizing-content max-h-48 min-h-16 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("assistant.editCancel")}
        </Button>
        <Button type="submit" data-testid="assistant-edit-save" disabled={text.trim() === ""}>
          {t("assistant.editSave")}
        </Button>
      </div>
    </form>
  );
}

const actionVisibility =
  "-mt-1 " +
  "opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-focus-within/turn:opacity-100 group-hover/turn:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none";

export function AssistantTranscript({
  messages,
  status,
  skills = [],
  onSuggestion,
  onPickSkill,
  onRegenerate,
  onEdit,
  className,
}: {
  messages: readonly ChatMessage[];
  status: ChatStatus;
  skills?: readonly SkillSummary[];
  onSuggestion: (text: string) => void;
  onPickSkill?: (skill: SkillSummary) => void;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, text: string) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const streaming = status === "streaming";

  if (messages.length === 0) {
    return (
      <div
        className={cn(
          "enter-soft mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center",
          className,
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-soft-foreground">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="text-[15px] font-semibold text-ink">{t("assistant.empty.title")}</p>
          <p className="text-[13px] text-ink-muted">{t("assistant.empty.detail")}</p>
        </div>
        {skills.length > 0 ? (
          <div className="w-full space-y-2 text-left">
            <p className="text-[12px] font-medium text-ink-muted">{t("assistant.skill.start")}</p>
            <ul className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <li key={skill.key}>
                  <button
                    type="button"
                    data-testid="assistant-skill-suggestion"
                    title={skill.description}
                    onClick={() => onPickSkill?.(skill)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] text-ink-soft outline-none transition-colors duration-150 ease-out hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  >
                    <Slash size={12} aria-hidden="true" />
                    {skill.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="flex w-full flex-col gap-2">
          {SUGGESTIONS.map((key) => (
            <li key={key}>
              <button
                type="button"
                data-testid="assistant-suggestion"
                onClick={() => onSuggestion(t(key))}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-[13px] text-ink-soft outline-none transition-colors duration-150 ease-out hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
              >
                {t(key)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const lastAssistant = messages.findLastIndex((message) => message.role === "assistant");

  return (
    <ol
      className={cn("mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-5", className)}
      aria-label={t("assistant.transcript")}
    >
      {messages.map((message, index) => {
        const mine = message.role === "user";
        const isLast = index === messages.length - 1;
        const live = streaming && isLast && !mine;
        const waiting = live && message.content === "";

        if (mine && editing === message.id) {
          return (
            <li key={message.id} data-role="user" className="flex justify-end">
              <EditForm
                initial={message.content}
                onCancel={() => setEditing(null)}
                onSave={(text) => {
                  setEditing(null);
                  onEdit?.(message.id, text);
                }}
              />
            </li>
          );
        }

        return (
          <li
            key={message.id}
            data-role={message.role}
            className={cn("message-in group/turn flex flex-col gap-1.5", mine && index > 0 && "mt-3")}
          >
            {mine ? (
              <div className="flex flex-col items-end gap-1">
                {message.skill ? <SkillChip title={message.skill.title} /> : null}
                <Bubble align="end" variant="default" className="max-w-[88%]">
                  <BubbleContent className="rounded-2xl rounded-br-md text-[14px]">
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p>
                  </BubbleContent>
                </Bubble>
                {onEdit && !streaming ? (
                  <div className={actionVisibility}>
                    <button
                      type="button"
                      data-testid="assistant-edit"
                      onClick={() => setEditing(message.id)}
                      aria-label={t("assistant.edit")}
                      title={t("assistant.edit")}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-muted outline-none transition-colors duration-150 ease-out hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {message.tools?.length ? (
                  <div className="flex flex-col gap-1.5">
                    {message.tools.map((card, position) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: cards of one answer only grow; a name can repeat.
                      <ToolCardView key={`${card.name}-${position}`} card={card} />
                    ))}
                  </div>
                ) : null}
                {waiting ? (
                  <Thinking />
                ) : (
                  <div className="text-[14px] leading-relaxed text-ink">
                    <RichText text={message.content} />
                    {live ? <span className="stream-caret text-ink-soft" aria-hidden="true" /> : null}
                  </div>
                )}
                {!live && message.content !== "" ? (
                  <div className={cn("flex items-center gap-0.5", actionVisibility)}>
                    <CopyButton text={message.content} label={t("assistant.copy")} testId="assistant-copy" />
                    {index === lastAssistant && onRegenerate && !streaming ? (
                      <button
                        type="button"
                        data-testid="assistant-regenerate"
                        onClick={onRegenerate}
                        aria-label={t("assistant.regenerate")}
                        title={t("assistant.regenerate")}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-muted outline-none transition-colors duration-150 ease-out hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                      >
                        <RefreshCw size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
