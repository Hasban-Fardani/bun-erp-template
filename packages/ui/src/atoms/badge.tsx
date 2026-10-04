import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-background text-ink-soft",
      )}
    >
      {children}
    </span>
  );
}
