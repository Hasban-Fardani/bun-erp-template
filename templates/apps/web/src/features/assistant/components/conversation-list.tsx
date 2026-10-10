import { useI18n } from "@loom/i18n/react";
import { Button } from "@loom/ui/atoms/button.tsx";
import { IconButton } from "@loom/ui/atoms/icon-button.tsx";
import { Skeleton } from "@loom/ui/atoms/skeleton.tsx";
import { cn } from "@web/lib/cn.ts";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";

export type ConversationItem = {
  id: string;
  title: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  state: "loading" | "ready" | "error";
  items: readonly ConversationItem[];
  activeId: string | null;
  /** History is turned off server-side, so the list explains why nothing is saved. */
  historyOff?: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onRetry?: () => void;
  /** Called after choosing a conversation, so a drawer can close itself. */
  onDone?: () => void;
};

function Row({
  item,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  item: ConversationItem;
  active: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const { t, formatRelativeTime } = useI18n();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [title, setTitle] = useState(item.title);

  if (mode === "rename") {
    const save = (event: FormEvent) => {
      event.preventDefault();
      const next = title.trim();
      if (next !== "" && next !== item.title) onRename(next);
      setMode("view");
    };
    return (
      <form onSubmit={save} className="flex items-center gap-1 px-1 py-1">
        <input
          // biome-ignore lint/a11y/noAutofocus: the field appears because the user asked to rename.
          autoFocus
          data-testid="conversation-rename-input"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setMode("view");
            }
          }}
          aria-label={t("assistant.list.rename")}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <IconButton icon={Check} label={t("assistant.list.renameSave")} type="submit" />
        <IconButton icon={X} label={t("assistant.editCancel")} onClick={() => setMode("view")} />
      </form>
    );
  }

  if (mode === "delete") {
    return (
      <div className="space-y-2 rounded-lg bg-danger-soft px-3 py-2.5" role="alert">
        <p className="text-[13px] text-danger">{t("assistant.list.deleteConfirm")}</p>
        <div className="flex gap-2">
          <Button variant="danger" className="h-8" data-testid="conversation-delete-confirm" onClick={onDelete}>
            {t("assistant.list.deleteYes")}
          </Button>
          <Button variant="ghost" className="h-8" onClick={() => setMode("view")}>
            {t("assistant.list.deleteNo")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/row relative flex items-center rounded-lg transition-colors duration-150 ease-out motion-reduce:transition-none",
        active ? "bg-accent-soft" : "hover:bg-background",
      )}
    >
      <button
        type="button"
        data-testid="conversation-item"
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span
          className={cn(
            "block truncate text-[13.5px] leading-tight",
            active ? "font-semibold text-accent-soft-foreground" : "text-ink",
          )}
        >
          {item.title || t("assistant.list.untitled")}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-ink-muted">{formatRelativeTime(item.updatedAt)}</span>
      </button>
      <span className="flex shrink-0 pr-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none">
        <IconButton
          icon={Pencil}
          label={t("assistant.list.rename")}
          data-testid="conversation-rename"
          onClick={() => {
            setTitle(item.title);
            setMode("rename");
          }}
        />
        <IconButton
          icon={Trash2}
          label={t("assistant.list.delete")}
          variant="danger"
          data-testid="conversation-delete"
          onClick={() => setMode("delete")}
        />
      </span>
    </div>
  );
}

/** Saved conversations, newest first. Pure presentation: the screen owns fetching and mutations. */
export function ConversationList({
  state,
  items,
  activeId,
  historyOff = false,
  onOpen,
  onNew,
  onRename,
  onDelete,
  onRetry,
  onDone,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-[14px] font-semibold text-ink">{t("assistant.list.title")}</h2>
        <Button
          variant="ghost"
          icon={Plus}
          data-testid="conversation-new"
          onClick={() => {
            onNew();
            onDone?.();
          }}
        >
          {t("assistant.list.new")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {state === "loading" ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} data-testid="conversation-skeleton" className="space-y-1.5 px-3 py-2">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : state === "error" ? (
          <div className="space-y-2 px-3 py-4" role="alert" data-testid="conversation-error">
            <p className="text-[13px] text-danger">{t("assistant.list.error")}</p>
            {onRetry ? (
              <Button variant="ghost" className="-ml-2 h-8" onClick={onRetry}>
                {t("assistant.retry")}
              </Button>
            ) : null}
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="conversation-empty"
            className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-ink-muted"
          >
            <MessageSquare size={20} aria-hidden="true" />
            <p>{historyOff ? t("assistant.list.emptyOff") : t("assistant.list.empty")}</p>
          </div>
        ) : (
          <ul className="space-y-0.5" aria-label={t("assistant.list.title")}>
            {items.map((item) => (
              <li key={item.id}>
                <Row
                  item={item}
                  active={item.id === activeId}
                  onOpen={() => {
                    onOpen(item.id);
                    onDone?.();
                  }}
                  onRename={(title) => onRename(item.id, title)}
                  onDelete={() => onDelete(item.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
