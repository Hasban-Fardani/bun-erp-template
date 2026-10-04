import { useMemo, useState } from "react";
import { ChartFrame, chartColor } from "../atoms/chart-frame";
import { Cell, LabelList, Legend, Pie, RechartsPieChart, ResponsiveContainer, Tooltip } from "../primitives";
import type { ChartKey } from "../types";

export type PieChartVariant =
  | "simple"
  | "separator-none"
  | "label"
  | "label-custom"
  | "label-list"
  | "legend"
  | "donut"
  | "donut-active"
  | "donut-text"
  | "stacked"
  | "interactive";

export interface PieChartProps<Row extends object> {
  data: Row[];
  nameKey: ChartKey<Row>;
  valueKey: ChartKey<Row>;
  label: string;
  height?: number;
  colors?: readonly string[];
  variant?: PieChartVariant;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
  onSliceSelect?: (row: Row, index: number) => void;
}

/** Pie and donut patterns from the shadcn gallery. Caller owns labels, data and selection state. */
export function PieChart<Row extends object>({
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
  onSliceSelect,
}: PieChartProps<Row>) {
  const donut = variant.startsWith("donut");
  const labelSlices = variant === "label" || variant === "label-custom";
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(() =>
    variant === "donut-active" || variant === "interactive" ? 0 : undefined,
  );
  const selectedRow = useMemo(() => data[selectedIndex ?? 0], [data, selectedIndex]);
  return (
    <ChartFrame label={label} height={height} colors={colors} className={className}>
      <div className="bun-erp-chart-content">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RechartsPieChart accessibilityLayer>
            <Pie
              data={data}
              dataKey={valueKey as string}
              nameKey={nameKey as string}
              innerRadius={donut ? "55%" : 0}
              outerRadius="88%"
              paddingAngle={variant === "separator-none" ? 0 : 2}
              label={labelSlices}
              labelLine={variant !== "label-custom"}
              onClick={(_, index) => {
                const row = data[index];
                if (variant === "donut-active" || variant === "interactive") setSelectedIndex(index);
                if (row) onSliceSelect?.(row, index);
              }}
            >
              {variant === "label-list" ? <LabelList dataKey={nameKey as string} position="outside" /> : null}
              {data.map((row, index) => (
                <Cell
                  key={String(row[nameKey])}
                  fill={chartColor(index, colors)}
                  fillOpacity={
                    (variant === "donut-active" || variant === "interactive") &&
                    selectedIndex !== undefined &&
                    selectedIndex !== index
                      ? 0.5
                      : 1
                  }
                  stroke={variant === "separator-none" ? "none" : "var(--color-background, #fff)"}
                  strokeWidth={variant === "separator-none" ? 0 : selectedIndex === index ? 3 : 2}
                />
              ))}
            </Pie>
            <Tooltip />
            {variant === "legend" || variant === "stacked" ? <Legend /> : null}
          </RechartsPieChart>
        </ResponsiveContainer>
        {variant === "donut-text" ? (
          <div className="bun-erp-chart-overlay">
            {centerValue ? (
              <strong>{centerValue}</strong>
            ) : selectedRow ? (
              <strong>{String(selectedRow[valueKey])}</strong>
            ) : null}
            {centerLabel ? <span>{centerLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </ChartFrame>
  );
}
