// Adapted from dashboardblocks `activity-feed` (MIT); see packages/ui/dashboard-sources.json.
import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type ActivityTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

/** Tinted, readable in both palettes. Pair a tone with an icon and text, never alone. */
const activityToneClasses: Record<ActivityTone, string> = {
  accent: "bg-accent-soft text-accent-soft-foreground",
  danger: "bg-red-500/10 text-red-700 dark:text-red-400",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-800 dark:text-amber-400",
};

/** The icon for a kind of activity in a tinted circle. Say what it means in text nearby. */
export function ActivityIcon({
  className,
  icon,
  tone = "neutral",
}: {
  className?: string;
  icon: ReactNode;
  /** @default 'neutral' */
  tone?: ActivityTone;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "ring-card relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 [&_svg]:size-4",
        activityToneClasses[tone],
        className,
      )}
    >
      {icon}
    </span>
  );
}

/** A dot for unread items, with "Unread" for screen readers. */
export function UnreadDot({ className, label = "Unread" }: { className?: string; label?: string }) {
  return (
    <span className={cn("bg-primary size-2 shrink-0 rounded-full", className)}>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export { activityToneClasses };
