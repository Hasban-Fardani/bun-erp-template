import { useI18n } from "@bun-erp/i18n/react";
import { Bubble, BubbleContent } from "@bun-erp/ui/molecules/bubble.tsx";
import { Sparkles } from "lucide-react";
import type { ChatMessage, ChatStatus } from "../hooks/index.ts";
import { RichText } from "../lib/rich-text.tsx";

const SUGGESTIONS = [
  "assistant.suggestion.explain",
  "assistant.suggestion.write",
  "assistant.suggestion.summarize",
] as const;

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

export function AssistantTranscript({
  messages,
  status,
  onSuggestion,
}: {
  messages: readonly ChatMessage[];
  status: ChatStatus;
  onSuggestion: (text: string) => void;
}) {
  const { t } = useI18n();

  if (messages.length === 0) {
    return (
      <div className="enter-soft flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-soft-foreground">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="text-[15px] font-semibold text-ink">{t("assistant.empty.title")}</p>
          <p className="text-[13px] text-ink-muted">{t("assistant.empty.detail")}</p>
        </div>
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

  return (
    <ol className="flex flex-col gap-4 px-4 py-5" aria-label={t("assistant.transcript")}>
      {messages.map((message, index) => {
        const mine = message.role === "user";
        const waiting = !mine && message.content === "" && status === "streaming" && index === messages.length - 1;
        return (
          <li key={message.id} data-role={message.role} className="message-in flex flex-col">
            <Bubble align={mine ? "end" : "start"} variant={mine ? "default" : "ghost"} className="max-w-[88%]">
              <BubbleContent className={mine ? "rounded-2xl rounded-br-md text-[13.5px]" : "text-[13.5px] text-ink"}>
                {mine ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
                {!mine && waiting ? <Thinking /> : null}
                {!mine && !waiting ? <RichText text={message.content} /> : null}
              </BubbleContent>
            </Bubble>
          </li>
        );
      })}
    </ol>
  );
}
