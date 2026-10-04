import { ChartFrame } from "../atoms/chart-frame";
import {
  CartesianGrid,
  Legend,
  Line,
  RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "../primitives";
import type { CartesianChartProps, ChartKey } from "../types";
import { getSeriesColor } from "../types";

export type LineChartVariant =
  | "default"
  | "linear"
  | "step"
  | "multiple"
  | "dots"
  | "dots-custom"
  | "dots-colors"
  | "label"
  | "label-custom"
  | "interactive";

export interface LineChartProps<Row extends object> extends CartesianChartProps<Row> {
  variant?: LineChartVariant;
}

/** Line chart patterns from the shadcn gallery, with explicit data keys and series labels. */
export function LineChart<Row extends object>({
  data,
  categoryKey,
  series,
  label,
  height,
  colors,
  showGrid = true,
  showLegend,
  showXAxis = true,
  showYAxis = false,
  className,
  variant = "default",
}: LineChartProps<Row>) {
  const dots = variant.startsWith("dots") || variant === "interactive";
  return (
    <ChartFrame label={label} height={height} colors={colors} className={className}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <RechartsLineChart accessibilityLayer data={data} margin={{ left: 8, right: 8, top: 8 }}>
          {showGrid ? <CartesianGrid vertical={false} stroke="var(--color-border, #e7e5e4)" /> : null}
          {showXAxis ? <XAxis dataKey={categoryKey as ChartKey<Row>} tickLine={false} axisLine={false} /> : null}
          {showYAxis ? <YAxis tickLine={false} axisLine={false} /> : null}
          <Tooltip cursor={false} />
          {(showLegend ?? (variant === "multiple" || series.length > 1)) ? <Legend /> : null}
          {series.map((item, index) => (
            <Line
              key={item.dataKey}
              dataKey={item.dataKey}
              name={item.label}
              type={variant === "step" ? "step" : variant === "linear" ? "linear" : "natural"}
              stroke={getSeriesColor(item, index, colors)}
              strokeWidth={2}
              dot={dots ? { r: variant === "dots-custom" ? 5 : 3 } : false}
              activeDot={variant === "interactive" ? { r: 6 } : { r: 4 }}
              label={variant === "label" || variant === "label-custom"}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
