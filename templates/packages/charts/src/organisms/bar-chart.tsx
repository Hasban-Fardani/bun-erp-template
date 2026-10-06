import { ChartFrame } from "../atoms/chart-frame";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  RechartsBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "../primitives";
import type { CartesianChartProps, ChartKey } from "../types";
import { getSeriesColor } from "../types";

export type BarChartVariant =
  | "default"
  | "horizontal"
  | "multiple"
  | "stacked"
  | "label"
  | "label-custom"
  | "mixed"
  | "active"
  | "negative"
  | "interactive";

export interface BarChartProps<Row extends object> extends CartesianChartProps<Row> {
  variant?: BarChartVariant;
  /** Line overlays used by the mixed chart pattern. */
  lineSeries?: CartesianChartProps<Row>["series"];
  /** Format values shown on the numeric axis. */
  valueFormatter?: (value: number) => string;
  /** Called when a bar is clicked in the interactive pattern. */
  onValueSelect?: (row: Row, series: string) => void;
  /** Custom label renderer for the label-custom pattern. */
  renderLabel?: (value: number) => string;
}

/** Bar chart patterns from the shadcn gallery, with local data and controlled event callbacks. */
export function BarChart<Row extends object>({
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
  valueFormatter,
  renderLabel,
  onValueSelect,
  lineSeries = [],
}: BarChartProps<Row>) {
  const horizontal = variant === "horizontal";
  const yAxis = showYAxis ?? horizontal;
  const chartProps = {
    accessibilityLayer: true,
    data,
    layout: horizontal ? ("vertical" as const) : ("horizontal" as const),
    margin: { left: 8, right: 8, top: 8 },
  };
  const axes = (
    <>
      {showGrid ? (
        <CartesianGrid vertical={!horizontal} horizontal={horizontal} stroke="var(--color-border, #e7e5e4)" />
      ) : null}
      {horizontal ? (
        <>
          {showXAxis ? <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={valueFormatter} /> : null}
          {yAxis ? (
            <YAxis type="category" dataKey={categoryKey as ChartKey<Row>} tickLine={false} axisLine={false} />
          ) : null}
        </>
      ) : (
        <>
          {showXAxis ? <XAxis dataKey={categoryKey as ChartKey<Row>} tickLine={false} axisLine={false} /> : null}
          {yAxis ? <YAxis tickLine={false} axisLine={false} tickFormatter={valueFormatter} /> : null}
        </>
      )}
      <Tooltip cursor={false} />
      {variant === "negative" ? (
        <ReferenceLine
          {...(horizontal ? { x: 0 } : { y: 0 })}
          stroke="var(--color-muted-foreground, #737373)"
          strokeDasharray="3 3"
        />
      ) : null}
      {(showLegend ?? (variant === "multiple" || variant === "stacked" || variant === "mixed")) ? <Legend /> : null}
    </>
  );
  const bars = series.map((item, index) => (
    <Bar
      key={item.dataKey}
      dataKey={item.dataKey}
      name={item.label}
      fill={getSeriesColor(item, index, colors)}
      stackId={variant === "stacked" ? "bar-stack" : undefined}
      radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
      activeBar={variant === "active" || variant === "interactive"}
      onClick={(entry) => {
        if (!onValueSelect) return;
        const row = entry?.payload;
        if (row && typeof row === "object") onValueSelect(row as Row, item.label);
      }}
    >
      {variant === "label" || variant === "label-custom" ? (
        <LabelList
          dataKey={item.dataKey}
          position={horizontal ? "right" : "top"}
          formatter={(value) => (renderLabel ? renderLabel(Number(value)) : String(value))}
        />
      ) : null}
    </Bar>
  ));
  return (
    <ChartFrame label={label} height={height} colors={colors} className={className}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {variant === "mixed" ? (
          <ComposedChart {...chartProps}>
            {axes}
            {bars}
            {lineSeries.map((item, index) => (
              <Line
                key={item.dataKey}
                dataKey={item.dataKey}
                name={item.label}
                stroke={getSeriesColor(item, index, colors)}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </ComposedChart>
        ) : (
          <RechartsBarChart {...chartProps}>
            {axes}
            {bars}
          </RechartsBarChart>
        )}
      </ResponsiveContainer>
    </ChartFrame>
  );
}
