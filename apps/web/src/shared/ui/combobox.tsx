import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "../../lib/cn.ts";
import { PopoverContent } from "./popover.tsx";

/**
 * Combobox, following shadcn/ui's pattern: `Popover` + `Command` + a trigger button.
 *
 * shadcn's newest `combobox` registry item is built on Base UI, which this repo does not use;
 * the Radix-based composition below is the same component the docs describe, assembled from
 * parts already installed. It exists because a plain select with many options is a scroll hunt:
 * above a handful of entries the user needs to type to narrow, not read a list.
 *
 * The threshold is enforced by `check:shadcn` — see docs/ui-components.md.
 */

export type ComboboxOption = { value: string; label: string; hint?: string };

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Pilih…",
  searchPlaceholder = "Cari…",
  emptyMessage = "Tidak ada yang cocok.",
  disabled,
  className,
  label,
  testId,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const inputId = useId();

  /**
   * Focus must be moved after the popover has mounted and Radix has finished its own focus work.
   * A ref passed through cmdk's Input was never populated, so the field is addressed by id; the
   * rAF defers past Radix's focus pass. Without this, typing lands on the trigger button and the
   * list never filters — the exact bug this component exists to avoid.
   */
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`${inputId}`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, inputId]);
  const selected = options.find((option) => option.value === value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        data-slot="combobox-trigger"
        data-testid={testId}
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-[14px] text-ink outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-accent",
          !selected && "text-ink-muted",
          className,
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
      </PopoverPrimitive.Trigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        {/* Default cmdk filtering: fuzzy, case-insensitive, and already tuned. A hand-written
            `filter` replaced it and returned 0 results for every query. */}
        <CommandPrimitive className="flex flex-col overflow-hidden rounded-lg">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
            {/* No `data-slot` here: cmdk locates its own input by the `cmdk-input` attribute,
                and overriding it made cmdk bounce focus to another element, so typing never
                reached the field. */}
            <CommandPrimitive.Input
              id={inputId}
              placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent text-[14px] outline-none placeholder:text-ink-muted"
            />
          </div>
          <CommandPrimitive.List className="max-h-64 overflow-y-auto p-1">
            <CommandPrimitive.Empty className="px-3 py-6 text-center text-[13px] text-ink-muted">
              {emptyMessage}
            </CommandPrimitive.Empty>
            {options.map((option) => (
              <CommandPrimitive.Item
                key={option.value}
                value={option.label}
                onSelect={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-[14px] outline-none select-none",
                  "data-[selected=true]:bg-background",
                )}
              >
                <Check
                  className={cn("size-4 shrink-0 text-accent", option.value === value ? "opacity-100" : "opacity-0")}
                  aria-hidden="true"
                />
                <span className="truncate">{option.label}</span>
                {option.hint ? <span className="ml-auto text-[12px] text-ink-muted">{option.hint}</span> : null}
              </CommandPrimitive.Item>
            ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </PopoverPrimitive.Root>
  );
}
