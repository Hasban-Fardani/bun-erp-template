import { useId } from "react";
import { ChartFrame, chartColor } from "../atoms/chart-frame";
import {
  Area,
  CartesianGrid,
  Legend,
  RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "../primitives";
import type { CartesianChartProps, ChartKey } from "../types";
import { getSeriesColor } from "../types";

export type AreaChartVariant =
  | "default"
  | "linear"
  | "step"
  | "legend"
  | "stacked"
  | "stacked-expand"
  | "icons"
  | "gradient"
  | "axes"
  | "interactive";

export interface AreaChartProps<Row extends object> extends CartesianChartProps<Row> {
  variant?: AreaChartVariant;
}

/** Area chart patterns from the shadcn gallery, driven by caller-owned data and labels. */
export function AreaChart<Row extends object>({
  data,
  categoryKey,
  series,
  label,
  height,
  colors,
  showGrid = true,
  showLegend,
  showXAxis = true,
  showYAxis,
  className,
  variant = "default",
}: AreaChartProps<Row>) {
  const gradientId = useId().replaceAll(":", "");
  const stacked = variant === "stacked" || variant === "stacked-expand";
  const yAxis = showYAxis ?? variant === "axes";
  const legend = showLegend ?? (variant === "legend" || variant === "icons" || series.length > 1);
  return (
    <ChartFrame label={label} height={height} colors={colors} className={className}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <RechartsAreaChart
          accessibilityLayer
          data={data}
          margin={{ left: 8, right: 8, top: 8 }}
          stackOffset={variant === "stacked-expand" ? "expand" : "none"}
        >
          {showGrid ? <CartesianGrid vertical={false} stroke="var(--color-border, #e7e5e4)" /> : null}
          {showXAxis ? <XAxis dataKey={categoryKey as ChartKey<Row>} tickLine={false} axisLine={false} /> : null}
          {yAxis ? <YAxis tickLine={false} axisLine={false} /> : null}
          <Tooltip cursor={false} />
          {legend ? <Legend iconType={variant === "icons" ? "circle" : undefined} /> : null}
          {variant === "gradient"
            ? series.map((item, index) => (
                <defs key={item.dataKey}>
                  <linearGradient id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={getSeriesColor(item, index, colors)} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={getSeriesColor(item, index, colors)} stopOpacity={0.08} />
                  </linearGradient>
                </defs>
              ))
            : null}
          {series.map((item, index) => (
            <Area
              key={item.dataKey}
              dataKey={item.dataKey}
              name={item.label}
              type={variant === "step" ? "step" : variant === "linear" ? "linear" : "natural"}
              stackId={stacked ? "area-stack" : undefined}
              stroke={getSeriesColor(item, index, colors)}
              fill={variant === "gradient" ? `url(#${gradientId}-${index})` : chartColor(index, colors)}
              fillOpacity={variant === "gradient" ? 0.7 : 0.18}
              activeDot={variant === "interactive" ? { r: 5 } : undefined}
              dot={variant === "interactive" ? { r: 3 } : false}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
