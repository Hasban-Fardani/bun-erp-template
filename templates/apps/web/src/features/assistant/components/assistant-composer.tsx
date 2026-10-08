import { useI18n } from "@bun-erp/i18n/react";
import { IconButton } from "@bun-erp/ui/atoms/icon-button.tsx";
import { ArrowUp, Slash, Square, X } from "lucide-react";
import { type KeyboardEvent, type RefObject, useEffect, useId, useState } from "react";
import type { SkillRef } from "../lib/chat-state.ts";
import { filterSkills, matchSkillQuery, moveIndex, type SkillSummary } from "../lib/skill-menu.ts";
import { SkillMenu, skillOptionId } from "./skill-menu.tsx";

/**
 * The message box: Enter sends, Shift+Enter breaks the line, a leading `/` opens the skill menu and
 * the chosen skill sits above the text as a removable chip. It grows with its text and keeps clear
 * of the phone's home indicator.
 */
export function AssistantComposer({
  draft,
  onDraftChange,
  skills,
  skill,
  onSkillChange,
  streaming,
  unavailable,
  onSend,
  onStop,
  inputRef,
  autoFocus = false,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  skills: readonly SkillSummary[];
  skill: SkillRef | null;
  onSkillChange: (skill: SkillRef | null) => void;
  streaming: boolean;
  unavailable: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const menuId = useId();
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const query = skill ? null : matchSkillQuery(draft);
  const matches = query === null ? [] : filterSkills(skills, query);
  const menuOpen = query !== null && skills.length > 0 && !dismissed;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  // The menu reopens whenever the command word changes after Esc.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `query` is the trigger, not a value read here.
  useEffect(() => {
    setDismissed(false);
    setActive(0);
  }, [query]);

  // Esc must close the menu, not the dialog around it. Radix listens on the document in the capture
  // phase, so this runs earlier, at the window, only while the menu is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      setDismissed(true);
    };
    window.addEventListener("keydown", onEscape, { capture: true });
    return () => window.removeEventListener("keydown", onEscape, { capture: true });
  }, [menuOpen]);

  // Browsers without `field-sizing: content` get the same auto-grow from the scroll height.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes.
  useEffect(() => {
    const node = inputRef.current;
    if (!node || (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content"))) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [draft, inputRef]);

  const pick = (chosen: SkillSummary) => {
    onSkillChange({ key: chosen.key, title: chosen.title });
    onDraftChange("");
    inputRef.current?.focus();
  };

  const submit = () => {
    if (draft.trim() === "" || streaming || unavailable) return;
    onSend(draft);
    onDraftChange("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && matches.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive(moveIndex(activeIndex, matches.length, event.key === "ArrowDown" ? "down" : "up"));
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        const chosen = matches[activeIndex];
        if (chosen) pick(chosen);
        return;
      }
    }
    // Backspace on an empty box removes the chip, like a token field.
    if (event.key === "Backspace" && draft === "" && skill) {
      onSkillChange(null);
      return;
    }
    // Enter sends, Shift+Enter breaks the line; IME composition must not send half a word.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="relative shrink-0 border-t border-border bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="relative mx-auto w-full max-w-3xl">
        {menuOpen ? (
          <SkillMenu id={menuId} skills={matches} activeIndex={activeIndex} onPick={pick} onHover={setActive} />
        ) : null}
        {unavailable ? (
          <p data-testid="assistant-unavailable" className="mb-2 text-[12.5px] text-ink-muted">
            {t("assistant.error.unavailable")}
          </p>
        ) : null}
        <div className="rounded-xl border border-border bg-surface px-3 py-2 transition-shadow duration-150 ease-out focus-within:ring-2 focus-within:ring-accent motion-reduce:transition-none">
          {skill ? (
            <span
              data-testid="assistant-composer-chip"
              className="mb-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-0.5 pl-2 text-[12px] font-medium text-accent-soft-foreground"
            >
              <Slash size={11} aria-hidden="true" />
              <span className="truncate">{skill.title}</span>
              <button
                type="button"
                data-testid="assistant-skill-remove"
                onClick={() => {
                  onSkillChange(null);
                  inputRef.current?.focus();
                }}
                aria-label={t("assistant.skill.remove")}
                title={t("assistant.skill.remove")}
                className="inline-flex size-6 items-center justify-center rounded-full outline-none hover:bg-accent/15 focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              data-testid="assistant-input"
              // biome-ignore lint/a11y/noAutofocus: the quick panel opens because the user asked to type.
              autoFocus={autoFocus}
              rows={1}
              value={draft}
              disabled={unavailable}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t("assistant.placeholder")}
              aria-label={t("assistant.placeholder")}
              role="combobox"
              aria-expanded={menuOpen && matches.length > 0}
              aria-controls={menuOpen && matches.length > 0 ? menuId : undefined}
              aria-activedescendant={menuOpen && matches.length > 0 ? skillOptionId(menuId, activeIndex) : undefined}
              aria-autocomplete="list"
              maxLength={4000}
              className="field-sizing-content max-h-40 min-h-6 flex-1 resize-none bg-transparent py-1 text-[14px] text-ink outline-none placeholder:text-ink-muted"
            />
            {streaming ? (
              <IconButton
                icon={Square}
                label={t("assistant.stop")}
                data-testid="assistant-stop"
                variant="ghost"
                onClick={onStop}
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
        </div>
        <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 px-1 text-[11px] text-ink-muted">
          <span>{t("assistant.disclaimer")}</span>
          {skills.length > 0 ? <span className="hidden sm:inline">{t("assistant.skill.hint")}</span> : null}
        </p>
      </div>
    </form>
  );
}
