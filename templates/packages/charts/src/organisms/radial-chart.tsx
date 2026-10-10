import { ChartFrame, chartColor } from "../atoms/chart-frame";
import { Cell, Legend, RadialBar, RechartsRadialBarChart, ResponsiveContainer, Tooltip } from "../primitives";
import type { ChartKey } from "../types";

export type RadialChartVariant = "simple" | "label" | "grid" | "text" | "shape" | "stacked";

export interface RadialChartProps<Row extends object> {
  data: Row[];
  nameKey: ChartKey<Row>;
  valueKey: ChartKey<Row>;
  label: string;
  height?: number;
  colors?: readonly string[];
  variant?: RadialChartVariant;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
}

/** Radial progress patterns from the shadcn gallery, with responsive geometry and custom labels. */
export function RadialChart<Row extends object>({
  data,
  nameKey,
  valueKey,
  label,
  height,
  colors,
  variant = "simple",
  centerLabel,
  centerValue,
  className,
}: RadialChartProps<Row>) {
  const grid = variant === "grid";
  const stacked = variant === "stacked";
  return (
    <ChartFrame label={label} height={height} colors={colors} className={className}>
      <div className="loom-chart-content">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RechartsRadialBarChart
            accessibilityLayer
            data={data}
            innerRadius="24%"
            outerRadius="86%"
            startAngle={90}
            endAngle={-270}
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const row = payload[0].payload as Row;
                return (
                  <div className="loom-chart-tooltip">
                    <span>{String(row[nameKey])}</span>
                    <strong>{String(row[valueKey])}</strong>
                  </div>
                );
              }}
            />
            {grid ? <Legend /> : null}
            <RadialBar
              dataKey={valueKey as string}
              background
              cornerRadius={variant === "shape" ? 4 : 999}
              stackId={stacked ? "radial-stack" : undefined}
              label={variant === "label"}
            >
              {data.map((row, index) => (
                <Cell key={String(row[nameKey])} fill={chartColor(index, colors)} />
              ))}
            </RadialBar>
          </RechartsRadialBarChart>
        </ResponsiveContainer>
        {variant === "text" ? (
          <div className="loom-chart-overlay">
            {centerValue ? <strong>{centerValue}</strong> : null}
            {centerLabel ? <span>{centerLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </ChartFrame>
  );
}
