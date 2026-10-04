// Adapted from dashboardcn (MIT); see THIRD_PARTY_NOTICES-dashboard.md.
import type * as React from "react";
import { formatNumber } from "../atoms/dashboard-format.ts";
import { cn } from "../lib/cn.ts";

export interface MeterZone {
  label?: string;
  from: number;
  to: number;
  /** Any CSS color. Defaults to chart-1. */
  color?: string;
}

export interface SegmentedMeterProps extends React.ComponentProps<"div"> {
  "aria-label": string;
  value: number;
  zones: MeterZone[];
  /** Only color the zone that contains the value; others stay muted. */
  highlightActive?: boolean;
  /** Show zone boundary values under the bar. */
  showTicks?: boolean;
  /** Show zone labels under the bar. */
  showLabels?: boolean;
  /** Show a marker at the current value. */
  showMarker?: boolean;
  tickFormatter?: (value: number) => string;
}

function SegmentedMeter({
  value,
  zones,
  highlightActive = true,
  showTicks = true,
  showLabels = false,
  showMarker = true,
  tickFormatter = (v) => formatNumber(v),
  "aria-label": ariaLabel,
  className,
  ...props
}: SegmentedMeterProps) {
  const min = zones.length ? Math.min(...zones.map((zone) => zone.from)) : 0;
  const max = zones.length ? Math.max(...zones.map((zone) => zone.to)) : 1;
  const span = max - min || 1;
  const position = Math.min(1, Math.max(0, (value - min) / span));
  const accessibleValue = Math.min(max, Math.max(min, value));
  const activeIndex = zones.findIndex(
    (z, i) => value >= z.from && (value < z.to || (i === zones.length - 1 && value <= z.to)),
  );

  return (
    <div data-slot="segmented-meter" className={cn("flex flex-col gap-1.5", className)} {...props}>
      <meter className="sr-only" min={min} max={max} value={accessibleValue} aria-label={ariaLabel} />
      <div className="relative">
        <div aria-hidden="true" className="flex h-2 w-full gap-0.5">
          {zones.map((zone, index) => {
            const active = index === activeIndex;
            const color = zone.color ?? "var(--color-accent)";
            return (
              <div
                key={`${zone.from}:${zone.to}:${zone.label ?? ""}`}
                data-active={active}
                className="bg-background h-full rounded-sm transition-colors first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${((zone.to - zone.from) / span) * 100}%`,
                  backgroundColor: !highlightActive || active ? color : undefined,
                }}
              />
            );
          })}
        </div>
        {showMarker ? (
          <div
            aria-hidden="true"
            className="bg-foreground ring-background absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
            style={{ left: `${position * 100}%` }}
          />
        ) : null}
      </div>
      {showTicks || showLabels ? (
        <div className="text-ink-muted relative h-4 text-[10px] tabular-nums">
          {showTicks
            ? [...new Set([min, ...zones.map((zone) => zone.to)])].map((tick, index, all) => (
                <span
                  key={tick}
                  className={cn(
                    "absolute top-0",
                    index === 0 && "left-0",
                    index === all.length - 1 && "right-0",
                    index > 0 && index < all.length - 1 && "-translate-x-1/2",
                  )}
                  style={index > 0 && index < all.length - 1 ? { left: `${((tick - min) / span) * 100}%` } : undefined}
                >
                  {tickFormatter(tick)}
                </span>
              ))
            : zones.map((zone) => (
                <span
                  key={`${zone.from}:${zone.to}:${zone.label ?? ""}`}
                  className="absolute top-0 -translate-x-1/2 truncate"
                  style={{
                    left: `${(((zone.from + zone.to) / 2 - min) / span) * 100}%`,
                  }}
                >
                  {zone.label}
                </span>
              ))}
        </div>
      ) : null}
    </div>
  );
}

export { SegmentedMeter };
