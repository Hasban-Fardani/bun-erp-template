export type ChartKey<Row extends object> = Extract<keyof Row, string>;

export interface ChartSeries<Row extends object> {
  dataKey: ChartKey<Row>;
  label: string;
  color?: string;
}

export interface CartesianChartProps<Row extends object> {
  /** Rows are passed through to Recharts without mutation. */
  data: Row[];
  /** Key used for the horizontal or category axis. */
  categoryKey: ChartKey<Row>;
  /** Numeric data series. */
  series: readonly ChartSeries<Row>[];
  /** Screen-reader description for the visualization. */
  label: string;
  height?: number;
  colors?: readonly string[];
  showGrid?: boolean;
  showLegend?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  className?: string;
}

export type ChartValueFormatter = (value: string | number) => string;

export function getSeriesColor<Row extends object>(
  series: ChartSeries<Row>,
  index: number,
  colors: readonly string[] | undefined,
): string {
  return series.color ?? colors?.[index] ?? `var(--loom-chart-${(index % 8) + 1}, #2563eb)`;
}
