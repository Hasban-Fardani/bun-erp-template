// Adapted from dashboardcn (MIT); see THIRD_PARTY_NOTICES-dashboard.md.

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type * as React from "react";
import { formatDelta } from "../atoms/dashboard-format.ts";
import { cn } from "../lib/cn.ts";

export type DeltaDirection = "up" | "down" | "flat";

export function getDeltaDirection(delta: number | undefined): DeltaDirection {
  if (delta === undefined || delta === 0 || !Number.isFinite(delta)) return "flat";
  return delta > 0 ? "up" : "down";
}

const directionIcon: Record<DeltaDirection, React.ElementType> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

export interface DeltaBadgeProps extends React.ComponentProps<"span"> {
  /** Fractional change, e.g. 0.124 for +12.4%. */
  delta: number;
  /** Treat a decrease as good and an increase as bad (churn, latency, errors). */
  invert?: boolean;
  variant?: "outline" | "soft" | "text";
  showIcon?: boolean;
}

function DeltaBadge({
  delta,
  invert = false,
  variant = "outline",
  showIcon = true,
  className,
  children,
  ...props
}: DeltaBadgeProps) {
  const direction = getDeltaDirection(delta);
  const positive = direction === "flat" ? null : (direction === "up") !== invert;
  const Icon = directionIcon[direction];

  return (
    <span
      data-slot="delta-badge"
      data-direction={direction}
      data-positive={positive}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        variant === "outline" && "rounded-md border px-1.5 py-0.5",
        variant === "soft" && "rounded-md px-1.5 py-0.5",
        variant === "soft" && positive === true && "bg-emerald-500/10",
        variant === "soft" && positive === false && "bg-red-500/10",
        variant === "soft" && positive === null && "bg-background",
        positive === true && "text-accent",
        positive === false && "text-danger",
        positive === null && "text-ink-muted",
        className,
      )}
      {...props}
    >
      {showIcon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children ?? formatDelta(delta)}
    </span>
  );
}

export { DeltaBadge };
