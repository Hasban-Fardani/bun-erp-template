# Shared atomic UI

React atoms, molecules, organisms and templates consumed by web and mobile. Import a component
subpath from `@bun-erp/ui`; route data, permissions, RPC and feature state stay in the consuming app.
Each subpath resolves directly to one source module. There is no all-components barrel, and the
package marks only `src/styles.css` as side-effectful.

```tsx
import { ActivityRings } from "@bun-erp/ui/organisms/activity-rings";
import { Button } from "@bun-erp/ui/atoms/button-primitives.tsx";
```

The atomic source tree now includes the official shadcn New York v4 components listed in
[`llms.txt`](llms.txt). Components that already had application-facing contracts remain at their
original paths; the full registry API is available from the sibling `*-primitives` module. This
preserves current consumers while making every registry component independently importable.
Vendored component sources are pinned to the commit in `component-sources.json`; the MIT notice is
preserved in `LICENSE.upstream`. The date picker, questionnaire, toast, typography and three layout
blocks are documented compositions where shadcn publishes usage guidance instead of a registry
source file.

`LoginBlock`, `SignupBlock` and `SidebarBlock` are layout examples. They receive submission or
navigation data from the app; authentication, routing and permissions remain app-owned.

## Dashboard components

Import from the layer that owns the behavior. The source file uses the same name as its component.

| Layer | Components |
|---|---|
| `atoms` | `CornerFrame`, `DeltaBadge` |
| `molecules` | `DistributionBar`, `MetricValue`, `SegmentedMeter`, `TickBar` |
| `organisms` | `ActivityRings`, `BarList`, `Breakdown`, `Comparison`, `DotPlot`, `FunnelChart`, `RadialGauge`, `Timeline` |

The visual components use native HTML or SVG. `SegmentedMeter` and `RadialGauge` require an
`aria-label` so their value has an accessible name. Keep chart data and query state in the consuming
feature; these components only render the props they receive. `Sparkline` and `MetricList` moved to
the opt-in `@bun-erp/charts` package (`bun erp packages:install charts`), where their renderer still
loads on demand.

`molecules/table` contains the shadcn Table primitive. The TanStack-backed `ResourceTable` and
server `DataTable`, and the renderer-backed `Sparkline` and `MetricList`, moved to the dedicated
table and chart packages; this package depends on neither. Forms use TanStack Form. Email and PDF
components live in the opt-in `@bun-erp/email` and `@bun-erp/pdf` packages (`bun erp packages:install
email` / `pdf`) because their renderers have different runtime and delivery constraints.

The exact allowed registry URLs are in [registry-allowlist.json](registry-allowlist.json) and
`components.json`. Review component provenance before adding source: the UI catalog pins vendored
shadcn files to an upstream commit and records each composed pattern; the installed email and PDF
packages pin their vendored files and preserve their MIT notices. Run `bun erp check:shadcn` to catch
unreviewed, stale or unlicensed entries.

See [atomic design and package boundaries](../../docs/architecture.md#atomic-design) and the
[UI registry skill](../../skills/ui-registry/SKILL.md).
