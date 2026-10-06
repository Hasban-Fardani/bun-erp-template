import { useI18n } from "@bun-erp/i18n/react";
import { Kbd } from "@bun-erp/ui/atoms/kbd.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@bun-erp/ui/molecules/command.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@bun-erp/ui/organisms/dialog.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Check, LogOut, Monitor, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { visibleNavGroups } from "../config/navigation.ts";
import type { ThemePreference } from "../lib/theme.ts";
import { useTheme } from "../lib/theme.tsx";

const THEME_CHOICES: {
  value: ThemePreference;
  labelKey: "theme.light" | "theme.dark" | "theme.system";
  icon: typeof Sun;
}[] = [
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
  { value: "system", labelKey: "theme.system", icon: Monitor },
];

/**
 * Keyboard-first way to move around the app. Every reachable page is already a row in the
 * navigation config, so the palette reads that list instead of keeping a second one in sync.
 */
export function CommandPalette({ permissions, onSignOut }: { permissions: readonly string[]; onSignOut: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pages = visibleNavGroups(permissions).flatMap((group) => group.items);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("command.open")}
        data-testid="command-trigger"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2 text-[13px] text-ink-muted outline-none transition-colors duration-150 ease-out hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
      >
        <Search size={14} aria-hidden="true" />
        <span className="hidden sm:inline">{t("command.open")}</span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("command.title")}</DialogTitle>
            <DialogDescription>{t("command.description")}</DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder={t("command.placeholder")} />
            <CommandList>
              <CommandEmpty>{t("command.empty")}</CommandEmpty>
              <CommandGroup heading={t("command.pages")}>
                {pages.map((page) => (
                  <CommandItem
                    key={page.url}
                    value={`${t(page.titleKey)} ${page.url}`}
                    onSelect={() => {
                      setOpen(false);
                      void navigate({ to: page.url });
                    }}
                  >
                    <page.icon aria-hidden="true" />
                    <span className="truncate">{t(page.titleKey)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading={t("command.actions")}>
                {THEME_CHOICES.map((choice) => (
                  <CommandItem
                    key={choice.value}
                    value={t(choice.labelKey)}
                    onSelect={() => {
                      setPreference(choice.value);
                      setOpen(false);
                    }}
                  >
                    <choice.icon aria-hidden="true" />
                    <span className="truncate">{t(choice.labelKey)}</span>
                    {preference === choice.value ? (
                      <Check size={14} className="ml-auto text-accent" aria-hidden="true" />
                    ) : null}
                  </CommandItem>
                ))}
                <CommandItem
                  value={t("navigation.signOut")}
                  onSelect={() => {
                    setOpen(false);
                    onSignOut();
                  }}
                >
                  <LogOut aria-hidden="true" />
                  <span className="truncate">{t("navigation.signOut")}</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
