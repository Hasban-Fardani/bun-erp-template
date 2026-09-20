import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

/**
 * Label rail ikon: tanpa ini, sidebar ringkas jadi teka-teki ikon. CSS-only (group-hover)
 * supaya tak menambah satu pun state atau listener React.
 */
export function Tooltip({
  label,
  side = "right",
  children,
  className,
}: {
  label: string;
  side?: "right" | "bottom";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className="group relative inline-flex w-full">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[12px] font-medium text-white opacity-0 shadow-md transition-opacity",
          "group-hover:opacity-100 group-focus-within:opacity-100",
          side === "right" && "left-full top-1/2 ml-2 -translate-y-1/2",
          side === "bottom" && "left-1/2 top-full mt-1.5 -translate-x-1/2",
          className,
        )}
      >
        {label}
      </span>
    </span>
  );
}
