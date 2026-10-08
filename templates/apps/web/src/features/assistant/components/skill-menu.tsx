import { useI18n } from "@bun-erp/i18n/react";
import { cn } from "@web/lib/cn.ts";
import type { SkillSummary } from "../lib/skill-menu.ts";

export const skillOptionId = (menuId: string, index: number) => `${menuId}-option-${index}`;

/**
 * The `/` menu. The textarea keeps focus (combobox pattern): it points at the active option with
 * `aria-activedescendant`, so arrow keys, Enter and Esc work without moving focus into the list.
 */
export function SkillMenu({
  id,
  skills,
  activeIndex,
  onPick,
  onHover,
}: {
  id: string;
  skills: readonly SkillSummary[];
  activeIndex: number;
  onPick: (skill: SkillSummary) => void;
  onHover: (index: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="absolute inset-x-0 bottom-full z-10 mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
      {skills.length === 0 ? (
        <p className="px-3 py-2.5 text-[13px] text-ink-muted">{t("assistant.skill.none")}</p>
      ) : (
        <div id={id} role="listbox" aria-label={t("assistant.skill.menu")} className="max-h-64 overflow-y-auto p-1">
          {skills.map((skill, index) => (
            <div
              key={skill.key}
              id={skillOptionId(id, index)}
              role="option"
              aria-selected={index === activeIndex}
              data-testid="assistant-skill-option"
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === "Enter") onPick(skill);
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(skill)}
              onMouseMove={() => onHover(index)}
              className={cn(
                "cursor-pointer rounded-lg px-3 py-2",
                index === activeIndex ? "bg-accent-soft text-accent-soft-foreground" : "text-ink",
              )}
            >
              <p className="text-[13.5px] font-medium leading-tight">
                <span className="font-mono text-[12px] opacity-70">/{skill.key}</span>
                <span className="ml-2">{skill.title}</span>
              </p>
              <p className="mt-0.5 truncate text-[12px] text-ink-muted">{skill.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
