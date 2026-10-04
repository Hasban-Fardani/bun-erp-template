import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn.ts";

export function Button({
  variant = "primary",
  icon: Icon,
  className,
  children,
  ...rest
}: {
  variant?: "primary" | "ghost" | "danger";
  icon?: LucideIcon;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        variant === "primary" && "bg-accent text-white hover:bg-accent/90",
        variant === "ghost" && "text-ink-soft hover:bg-background",
        variant === "danger" && "text-danger hover:bg-danger-soft",
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon size={15} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
