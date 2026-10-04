import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn.ts";

export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  className,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  variant?: "ghost" | "danger" | "primary";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors sm:size-8",
        "disabled:opacity-40 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        variant === "primary" && "bg-accent text-white hover:bg-accent/90",
        variant === "ghost" && "text-ink-soft hover:bg-background hover:text-ink",
        variant === "danger" && "text-ink-soft hover:bg-danger-soft hover:text-danger",
        className,
      )}
      {...rest}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}
