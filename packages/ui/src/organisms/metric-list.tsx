// Adapted from dashboardcn (MIT); see THIRD_PARTY_NOTICES-dashboard.md.

import type * as React from "react";
import type { NumberFormat } from "../atoms/dashboard-format.ts";
import { DeltaBadge, getDeltaDirection } from "../atoms/delta-badge.tsx";
import { cn } from "../lib/cn.ts";
import { MetricValue } from "../molecules/metric-value.tsx";
import { Sparkline } from "./sparkline.tsx";

export interface MetricListItem {
  label: string;
  value: number | string;
  delta?: number;
  trend?: number[];
  format?: NumberFormat;
  currency?: string;
  invertDelta?: boolean;
  icon?: React.ReactNode;
  key?: string;
}

export interface MetricListProps extends React.ComponentProps<"div"> {
  items: MetricListItem[];
  /** Sparkline variant. */
  variant?: "area" | "line";
  /** Sparkline area fill. */
  fill?: "gradient" | "dots";
  showDivider?: boolean;
}

/** Compact rows of label, sparkline, value, and delta. */
function MetricList({ items, variant = "line", fill, showDivider = true, className, ...props }: MetricListProps) {
  return (
    <div data-slot="metric-list" className={cn("flex flex-col", showDivider && "divide-y", className)} {...props}>
      {items.map((item) => {
        const direction = getDeltaDirection(item.delta);
        const positive = direction === "flat" ? null : (direction === "up") !== Boolean(item.invertDelta);
        const color =
          positive === true
            ? "var(--color-accent)"
            : positive === false
              ? "var(--color-danger)"
              : "var(--color-ink-muted)";
        return (
          <div
            key={item.key ?? item.label}
            data-slot="metric-list-row"
            className="flex items-center gap-4 py-2.5 text-sm first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {item.icon ? <span className="text-ink-muted shrink-0 [&>svg]:size-4">{item.icon}</span> : null}
              <span className="truncate">{item.label}</span>
            </div>
            {item.trend && item.trend.length > 1 ? (
              <Sparkline data={item.trend} variant={variant} fill={fill} color={color} className="h-6 w-20 shrink-0" />
            ) : null}
            <div className="flex w-28 shrink-0 items-center justify-end gap-2 tabular-nums">
              <MetricValue value={item.value} format={item.format} currency={item.currency} className="font-medium" />
              {item.delta !== undefined ? (
                <DeltaBadge delta={item.delta} invert={item.invertDelta} variant="text" showIcon={false} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { MetricList };
