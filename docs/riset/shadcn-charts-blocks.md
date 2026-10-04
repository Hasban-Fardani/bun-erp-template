# shadcn charts and blocks research

Research date: 2026-10-04. This note covers the official shadcn/ui chart gallery and reusable page blocks for this React monorepo.

## What the official sources provide

The chart gallery is a set of React/Recharts examples grouped into area, bar, line, pie, radar, radial, and tooltip patterns. It is source code intended to be copied and adapted, rather than a single data-fetching or ERP-domain chart API. The examples cover interactive filters, stacked/multiple series, labels, legends, axes, and custom tooltips. See the [chart gallery](https://ui.shadcn.com/charts/), [area examples](https://ui.shadcn.com/charts/area), [bar examples](https://ui.shadcn.com/charts/bar), [line examples](https://ui.shadcn.com/charts/line), [pie examples](https://ui.shadcn.com/charts/pie), [radar examples](https://ui.shadcn.com/charts/radar), and [radial examples](https://ui.shadcn.com/charts/radial).

The official Data Table guide uses TanStack Table with shadcn's basic `Table` primitives and walks through row actions, pagination, sorting, filtering, visibility, and selection. It explicitly treats each table as application-specific and recommends extracting a reusable component only when a pattern is shared. Keep that separation: base visual table elements in `@bun-erp/ui`; query/data adapters and the opinionated generic grid in `@bun-erp/data-table`. See the [official Data Table guide](https://ui.shadcn.com/docs/components/base/data-table).

The official blocks are page-level starting points. High-value patterns for this template are a dashboard shell with sidebar/header/content slots, a collapsible icon sidebar, a nested-navigation sidebar, and login/signup layouts. The current catalog shows `dashboard-01`, `sidebar-01`, `sidebar-03`, `sidebar-07`, login variants, and signup variants. The dashboard example composes a sidebar, header, cards, chart, and table; the authentication blocks provide layout/form composition patterns. See [all blocks](https://ui.shadcn.com/blocks), [sidebar blocks](https://ui.shadcn.com/blocks/sidebar), [authentication blocks](https://ui.shadcn.com/blocks/authentication), and the [shadcn monorepo guide](https://ui.shadcn.com/docs/monorepo).

The upstream shadcn/ui repository is MIT-licensed. Retain its required license notice with vendored source and record the exact upstream registry item, style, and source revision in the project's component provenance catalog. See the [upstream license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md).

## Recommended package boundaries

- `@bun-erp/ui` owns small primitives (including `Table`, `Sidebar`, form controls, and overlays) and page-layout compositions. It remains an optional client package; the server Worker must not import it.
- `@bun-erp/data-table` owns the TanStack Table v9 local and controlled/manual table presets plus composable table primitives. Feature-owned Query/Hono RPC adapters stay in app code, where the endpoint schema and API envelope are known.
- `@bun-erp/charts` owns typed area, bar, line, pie, radar, and radial chart components with gallery-pattern variants. It consolidates repeated upstream examples into configurable family components rather than copying every demo as a separate file. Recharts stays optional and isolated from `@bun-erp/ui` and the Worker. Export each chart by a direct subpath; do not import a package-wide runtime barrel.
- For route-level use, load a chart or dashboard block from a lazy route/dynamic import. Keep ordinary list/detail routes independent of Recharts so they do not pay for a chart library they never render.

## Adaptation requirements

- Preserve the upstream visual mechanics and component composition, but remove sample records, branded names, fake monetary data, and application routes. A chart receives its data, labels, formatting, colors, and accessible description from the consuming feature.
- Keep login/signup layout blocks presentational. The app owns validation, auth requests, redirects, and provider availability.
- Keep dashboard and sidebar blocks driven by typed navigation/config props. Do not bake product-specific menu groups into the shared package.
- Make the mobile web layout responsive, but keep native mobile screens under `apps/mobile`; both apps may import shared visual primitives.
- Expose optional features through direct subpath exports. Verify an importing route tree-shakes unused chart types, and confirm the Cloudflare Worker entry has no import edge to `@bun-erp/charts` or `@bun-erp/data-table`.

## Catalog to vendor

The shared package currently covers the six data-chart families and gallery variants; tooltip and filter renderers remain composable through Recharts primitives. The UI catalog includes the reusable dashboard/sidebar and login/signup layouts. Preserve upstream names in provenance metadata while using domain-neutral local module names.

Run `bun erp check:shadcn` to validate the pinned upstream UI catalog and provenance records. Chart variants are maintained package components rather than individual shadcn registry files, so keep their API guide and family tests current when the official gallery changes.
