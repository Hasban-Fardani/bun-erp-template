import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

/**
 * The one empty surface for a place that has nothing to show. `TableEmpty` composes it for list
 * states, and screens use it directly for permission and not-found branches so the app has a
 * single empty shape instead of two that drift.
 *
 * `action` is not decoration: an empty area with no way out is a dead end.
 */
export function EmptyState({
  message,
  icon: Icon,
  title,
  action,
  iconClassName,
  className,
}: {
  message?: string;
  icon?: LucideIcon;
  title?: string;
  action?: ReactNode;
  iconClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("enter-soft flex flex-col items-center gap-2 px-4 py-10 text-center", className)}>
      {Icon ? (
        <Icon size={20} aria-hidden="true" className={cn("shrink-0", iconClassName ?? "text-ink-muted")} />
      ) : null}
      {title ? <p className="text-sm font-medium text-ink">{title}</p> : null}
      {message ? <p className="max-w-sm text-[13px] text-ink-muted">{message}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
