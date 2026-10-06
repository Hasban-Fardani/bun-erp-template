import { ChartFrame } from "../atoms/chart-frame";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RechartsRadarChart,
  ResponsiveContainer,
  Tooltip,
} from "../primitives";
import type { CartesianChartProps, ChartKey } from "../types";
import { getSeriesColor } from "../types";

export type RadarChartVariant =
  | "default"
  | "dots"
  | "lines-only"
  | "label-custom"
  | "grid-custom"
  | "grid-none"
  | "grid-circle"
  | "grid-circle-no-lines"
  | "grid-circle-fill"
  | "grid-fill"
  | "multiple"
  | "legend";

export interface RadarChartProps<Row extends object> extends CartesianChartProps<Row> {
  variant?: RadarChartVariant;
}

/** Radar chart patterns from the shadcn gallery, including polygon/circle grid variants. */
export function RadarChart<Row extends object>({
  data,
  categoryKey,
  series,
  label,
  height,
  colors,
  showLegend,
  className,
  variant = "default",
}: RadarChartProps<Row>) {
  const circular = variant.startsWith("grid-circle");
  const hideGrid = variant === "grid-none";
  const filled = variant === "grid-fill" || variant === "grid-circle-fill";
  const showDots = variant === "dots" || variant === "default";
  return (
    <ChartFrame label={label} height={height} colors={colors} className={className}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <RechartsRadarChart accessibilityLayer data={data}>
          {hideGrid ? null : (
            <PolarGrid
              gridType={circular ? "circle" : "polygon"}
              radialLines={variant !== "grid-circle-no-lines"}
              fill={filled ? "var(--color-muted, #f5f5f4)" : undefined}
            />
          )}
          <PolarAngleAxis dataKey={categoryKey as ChartKey<Row>} />
          <PolarRadiusAxis axisLine={false} tick={false} />
          <Tooltip />
          {(showLegend ?? (variant === "legend" || variant === "multiple" || series.length > 1)) ? <Legend /> : null}
          {series.map((item, index) => (
            <Radar
              key={item.dataKey}
              name={item.label}
              dataKey={item.dataKey}
              stroke={getSeriesColor(item, index, colors)}
              fill={getSeriesColor(item, index, colors)}
              fillOpacity={variant === "lines-only" ? 0 : filled ? 0.42 : 0.18}
              dot={showDots}
            />
          ))}
        </RechartsRadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
