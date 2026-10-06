# `@bun-erp/charts`

Optional browser-side charts built with Recharts. Each family has a direct entry point so file-based routes can load only the chart types they render.

```tsx
import { BarChart } from "@bun-erp/charts/bar";

<BarChart
  label="Requests by day"
  data={rows}
  categoryKey="day"
  series={[{ dataKey: "requests", label: "Requests" }]}
  variant="default"
/>
```

See [`llms.txt`](./llms.txt) for exports, gallery pattern coverage, and loading guidance. Besides the chart families, the package ships the lazy `Sparkline` and the `MetricList` composition; both compose `@bun-erp/ui` atoms and molecules. The chart package is presentation-only and must not enter the API or Cloudflare Worker dependency graph.
