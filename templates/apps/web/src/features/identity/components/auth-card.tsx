import { LocaleSwitcher } from "@loom/i18n/react";
import { uiConfig } from "@web/config/ui.ts";
import { Users as UsersIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The single-column frame shared by the account-recovery screens: brand lockup, locale switcher and
 * a narrow content column that matches the sign-in form width. Sign-in keeps its own two-column
 * layout; these screens are short and need no marketing panel.
 */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="enter-soft mb-6 flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink">
          <UsersIcon className="size-5" aria-hidden="true" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">{uiConfig.appName}</span>
      </div>
      <div className="mb-4 flex w-full max-w-[23rem] justify-end">
        <LocaleSwitcher className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink" />
      </div>
      <div className="enter-soft mx-auto w-full max-w-[23rem]">{children}</div>
    </div>
  );
}
