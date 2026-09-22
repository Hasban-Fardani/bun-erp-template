import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn.ts";

/**
 * A labelled pill for a small piece of state: a permission, a scope, a system check. Used on
 * the login screen for the status strip, and reusable wherever a short word plus a tone is the
 * whole message.
 */
export function StatusPill({
  icon: Icon,
  label,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  tone?: "neutral" | "accent" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium",
        tone === "accent" && "border-accent/25 bg-accent-soft text-accent",
        tone === "danger" && "border-danger/25 bg-danger-soft text-danger",
        tone === "neutral" && "border-border bg-surface text-ink-soft",
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  );
}
