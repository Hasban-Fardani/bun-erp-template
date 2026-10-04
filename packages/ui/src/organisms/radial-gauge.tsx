// Adapted from dashboardcn (MIT); see THIRD_PARTY_NOTICES-dashboard.md.
import type * as React from "react";

import { cn } from "../lib/cn.ts";

export interface RadialGaugeProps extends React.ComponentProps<"div"> {
  "aria-label": string;
  value: number;
  min?: number;
  max?: number;
  /** Diameter in pixels. */
  size?: number;
  /** Stroke width in pixels. */
  thickness?: number;
  /** Number of arc segments. 0 draws a continuous arc. */
  segments?: number;
  /** Gap between segments in degrees. */
  gap?: number;
  /** Angle where the arc starts, in degrees clockwise from 12 o'clock. */
  startAngle?: number;
  /** Total sweep of the arc in degrees. 180 is a semicircle, 360 a ring. */
  sweep?: number;
  /** Any CSS color. Defaults to chart-1. */
  color?: string;
  trackColor?: string;
  /** Reveal filled segments in sequence when the gauge mounts. */
  animate?: boolean;
  /** Total reveal time in milliseconds. */
  animationDuration?: number;
  /** Content rendered in the middle of the gauge. */
  children?: React.ReactNode;
}

type GaugeArc = { id: string; from: number; to: number; filled: boolean };

// Round so server and client render identical path strings.
const round = (n: number) => Math.round(n * 1000) / 1000;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const start = polar(cx, cy, r, from);
  const end = polar(cx, cy, r, to);
  const largeArc = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function createArcs(segments: number, sweep: number, start: number, gap: number, fraction: number): GaugeArc[] {
  const step = sweep / segments;
  return Array.from({ length: segments }, (_, index) => {
    const from = start + index * step + gap / 2;
    const to = start + (index + 1) * step - gap / 2;
    return { id: `segment-${index}`, from, to, filled: (index + 0.5) / segments <= fraction };
  });
}

function SegmentedPaths({
  arcs,
  cx,
  cy,
  radius,
  fraction,
  segments,
  thickness,
  trackColor,
  color,
  animate,
  animationDuration,
}: {
  arcs: GaugeArc[];
  cx: number;
  cy: number;
  radius: number;
  fraction: number;
  segments: number;
  thickness: number;
  trackColor: string;
  color: string;
  animate: boolean;
  animationDuration: number;
}) {
  const filledCount = Math.max(1, Math.round(fraction * segments));
  return arcs.map((arc, index) => {
    const path = arcPath(cx, cy, radius, arc.from, arc.to);
    const delay = (index / filledCount) * animationDuration * 0.8;

    return (
      <g key={arc.id}>
        <path d={path} fill="none" stroke={trackColor} strokeWidth={thickness} strokeLinecap="butt" />
        {arc.filled ? (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="butt"
            className={cn(animate && "motion-safe:animate-in motion-safe:fade-in")}
            style={
              animate
                ? {
                    animationDelay: `${delay}ms`,
                    animationDuration: `${Math.max(120, animationDuration * 0.25)}ms`,
                    animationFillMode: "both",
                  }
                : undefined
            }
          />
        ) : null}
      </g>
    );
  });
}

function ContinuousPaths({
  cx,
  cy,
  radius,
  start,
  sweep,
  fraction,
  thickness,
  trackColor,
  color,
  animate,
  animationDuration,
}: {
  cx: number;
  cy: number;
  radius: number;
  start: number;
  sweep: number;
  fraction: number;
  thickness: number;
  trackColor: string;
  color: string;
  animate: boolean;
  animationDuration: number;
}) {
  const fullCircle = sweep >= 360;
  return (
    <>
      <path
        d={arcPath(cx, cy, radius, start, start + sweep - (fullCircle ? 0.01 : 0))}
        fill="none"
        stroke={trackColor}
        strokeWidth={thickness}
        strokeLinecap={fullCircle ? "butt" : "round"}
      />
      {fraction > 0 ? (
        <path
          d={arcPath(cx, cy, radius, start, start + sweep * fraction)}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          className={cn("transition-[d] duration-500", animate && "motion-safe:animate-in motion-safe:fade-in")}
          style={animate ? { animationDuration: `${animationDuration}ms` } : undefined}
        />
      ) : null}
    </>
  );
}

function GaugeContent({ children, sweep }: { children: React.ReactNode; sweep: number }) {
  if (!children) return null;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-x-0 flex flex-col items-center justify-center text-center",
        sweep > 200 ? "inset-y-0" : "bottom-0",
      )}
    >
      {children}
    </div>
  );
}

function RadialGauge({
  value,
  min = 0,
  max = 100,
  size = 160,
  thickness = 10,
  segments = 0,
  gap = 2,
  startAngle,
  sweep = 180,
  color = "var(--color-accent)",
  trackColor = "var(--color-border)",
  animate = false,
  animationDuration = 700,
  "aria-label": ariaLabel,
  className,
  children,
  ...props
}: RadialGaugeProps) {
  const fraction = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const accessibleValue = Math.min(Math.max(min, max), Math.max(Math.min(min, max), value));
  const start = startAngle ?? (sweep >= 360 ? 0 : -sweep / 2);
  const radius = size / 2 - thickness / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Trim the box to the arc's vertical extent so a semicircle does not reserve a full circle of space.
  const angles = Array.from({ length: 64 }, (_, index) => start + (sweep * index) / 63);
  const ys = angles.map((angle) => polar(cx, cy, radius, angle).y);
  const top = Math.max(0, Math.min(...ys) - thickness / 2);
  const bottom = Math.min(size, Math.max(...ys) + thickness / 2);
  const height = bottom - top;
  const arcs = createArcs(segments, sweep, start, gap, fraction);

  return (
    <div
      data-slot="radial-gauge"
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height }}
      {...props}
    >
      <meter
        className="sr-only"
        min={Math.min(min, max)}
        max={Math.max(min, max)}
        value={accessibleValue}
        aria-label={ariaLabel}
      />
      <svg
        width={size}
        height={height}
        viewBox={`0 ${top} ${size} ${height}`}
        className="absolute inset-0"
        aria-hidden="true"
      >
        {segments > 0 ? (
          <SegmentedPaths
            arcs={arcs}
            cx={cx}
            cy={cy}
            radius={radius}
            fraction={fraction}
            segments={segments}
            thickness={thickness}
            trackColor={trackColor}
            color={color}
            animate={animate}
            animationDuration={animationDuration}
          />
        ) : (
          <ContinuousPaths
            cx={cx}
            cy={cy}
            radius={radius}
            start={start}
            sweep={sweep}
            fraction={fraction}
            thickness={thickness}
            trackColor={trackColor}
            color={color}
            animate={animate}
            animationDuration={animationDuration}
          />
        )}
      </svg>
      <GaugeContent sweep={sweep}>{children}</GaugeContent>
    </div>
  );
}

export { RadialGauge };
