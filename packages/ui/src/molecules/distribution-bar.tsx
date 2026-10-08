// Adapted from dashboardcn (MIT); see THIRD_PARTY_NOTICES-dashboard.md.
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { formatNumber } from "../lib/dashboard-format.ts";

export interface DistributionSegment {
  name: string;
  value: number;
  /** Any CSS color. Defaults to chart-1 through chart-5 in order. */
  color?: string;
}

export interface DistributionBarProps extends React.ComponentProps<"div"> {
  segments: DistributionSegment[];
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  /** Show absolute values in the legend in addition to the share. */
  showValues?: boolean;
}

const defaultColors = [
  "var(--color-accent)",
  "var(--color-ink-soft)",
  "var(--color-ink-muted)",
  "var(--color-danger)",
  "var(--color-border)",
];

function DistributionBar({
  segments,
  valueFormatter = (value) => formatNumber(value, { format: "compact" }),
  showLegend = true,
  showValues = false,
  className,
  ...props
}: DistributionBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const resolved = segments.map((segment, index) => ({
    ...segment,
    color: segment.color ?? defaultColors[index % defaultColors.length],
    share: total > 0 ? segment.value / total : 0,
  }));

  return (
    <div data-slot="distribution-bar" className={cn("flex flex-col gap-3", className)} {...props}>
      <div
        role="img"
        aria-label={resolved
          .map((segment) => `${segment.name} ${formatNumber(segment.share, { format: "percent" })}`)
          .join(", ")}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {resolved.map((segment) =>
          segment.share > 0 ? (
            <div
              key={segment.name}
              className="h-full motion-safe:transition-[width] motion-safe:duration-300 first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${segment.share * 100}%`,
                backgroundColor: segment.color,
              }}
            />
          ) : null,
        )}
      </div>
      {showLegend ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {resolved.map((segment) => (
            <li key={segment.name} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-ink-muted">{segment.name}</span>
              <span className="font-medium tabular-nums">{formatNumber(segment.share, { format: "percent" })}</span>
              {showValues ? (
                <span className="text-ink-muted tabular-nums">({valueFormatter(segment.value)})</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { DistributionBar };
