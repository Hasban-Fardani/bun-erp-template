import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AreaChart } from "../src/organisms/area-chart";
import { BarChart } from "../src/organisms/bar-chart";
import { LineChart } from "../src/organisms/line-chart";
import { PieChart } from "../src/organisms/pie-chart";
import { RadarChart } from "../src/organisms/radar-chart";
import { RadialChart } from "../src/organisms/radial-chart";
import type { ChartSeries } from "../src/types";

type Row = { category: string; actual: number; target: number };

const rows: Row[] = [
  { category: "A", actual: 12, target: 10 },
  { category: "B", actual: 16, target: 14 },
];
const series: ChartSeries<Row>[] = [
  { dataKey: "actual", label: "Actual" },
  { dataKey: "target", label: "Target" },
];

test("each chart family renders its accessible name and isolated color palette", () => {
  const cases = [
    createElement(AreaChart<Row>, { label: "Area chart", data: rows, categoryKey: "category", series }),
    createElement(BarChart<Row>, { label: "Bar chart", data: rows, categoryKey: "category", series }),
    createElement(LineChart<Row>, { label: "Line chart", data: rows, categoryKey: "category", series }),
    createElement(PieChart<Row>, { label: "Pie chart", data: rows, nameKey: "category", valueKey: "actual" }),
    createElement(RadarChart<Row>, { label: "Radar chart", data: rows, categoryKey: "category", series }),
    createElement(RadialChart<Row>, { label: "Radial chart", data: rows, nameKey: "category", valueKey: "actual" }),
  ];

  for (const chart of cases) {
    const html = renderToStaticMarkup(chart);
    expect(html).toContain('data-slot="chart"');
    expect(html).toContain("aria-label=");
    expect(html).toContain("--bun-erp-chart-1");
  }
});
