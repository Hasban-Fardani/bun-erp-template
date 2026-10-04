import "../styles.css";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

const DEFAULT_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#4f46e5",
] as const;

export interface ChartFrameProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Accessible name that describes the chart's purpose. */
  label: string;
  /** Responsive chart height in CSS pixels. */
  height?: number;
  /** Per-chart palette. Each series can override its corresponding color. */
  colors?: readonly string[];
  children: ReactNode;
}

/** Accessible, responsive chart boundary with overridable theme palette tokens. */
export function ChartFrame({
  label,
  height = 280,
  colors = DEFAULT_PALETTE,
  className,
  style,
  children,
  ...props
}: ChartFrameProps) {
  const palette = Object.fromEntries(
    DEFAULT_PALETTE.map((fallback, index) => [`--bun-erp-chart-${index + 1}`, colors[index] ?? fallback]),
  ) as CSSProperties;

  return (
    <figure
      data-slot="chart"
      aria-label={label}
      className={className}
      style={{ ...palette, height, minWidth: 0, ...style }}
      {...props}
    >
      <figcaption className="bun-erp-chart-visually-hidden">{label}</figcaption>
      {children}
    </figure>
  );
}

export const DEFAULT_CHART_PALETTE = DEFAULT_PALETTE;

export function chartColor(index: number, colors: readonly string[] = DEFAULT_PALETTE): string {
  return colors[index] ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length] ?? DEFAULT_PALETTE[0];
}
