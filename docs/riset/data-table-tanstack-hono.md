# TanStack Data Table and Hono RPC

Research verified against the official docs on 2026-10-04. The implementation waits in the opt-in
catalog at [`templates/packages/data-table`](../../templates/packages/data-table/README.md) and
installs with `bun erp packages:install data-table`; this note records the decisions that guide
changes to it.

## Findings

- shadcn's Data Table is a composition recipe using TanStack Table and semantic table primitives.
  It leaves feature choices to the application; it does not prescribe one universal grid.
- TanStack Table v9 is the template baseline. Its feature sets and row-model factories are explicit,
  so the package registers only the client capabilities each preset needs.
- **Local-first** means that a complete array is processed in the browser. It does not mean durable
  offline storage or automatic sync. Those remain separate product decisions.
- Remote tables use controlled manual filtering, sorting, and pagination over the server-returned
  rows. The server supplies the total matching `rowCount`; client row models must not reprocess one
  page as if it were the full result.
- The table package owns generic table behavior. A web/mobile feature owns query keys, Hono RPC
  calls, API envelope handling, URL state, authorization, and translation between the API's
  one-based page and TanStack's zero-based `pageIndex`.

## Request paths

```text
Local:  feature data -> @bun-erp/data-table local preset -> shared table rendering
Remote: feature -> TanStack Query -> typed Hono RPC -> API page + total count
                           \\-> @bun-erp/data-table manual preset -> shared table rendering
```

Remote filter or sort changes reset `pageIndex` to zero. Include pagination, sort, and filter state
in the query key; pass Query's `AbortSignal` to the Hono client. Keep loading, stale-data, error, and
empty states accessible while retaining the previous rows during a page transition where suitable.

## Package map

- `@bun-erp/data-table` provides the local in-memory `DataTable`, typed columns, and composable
  semantic table/filter/pagination primitives.
- `@bun-erp/data-table/server` provides the controlled manual adapter for externally loaded rows.
- `@bun-erp/data-table/styles.css` is opt-in; the package has no Hono, Query, router, auth, storage,
  or application-schema dependency.
- Feature-owned Hono + Query examples live in the catalog's
  [`docs/usage.md`](../../templates/packages/data-table/docs/usage.md). Package API pointers for
  agents are in its [`llms.txt`](../../templates/packages/data-table/llms.txt).

## Sources

- [shadcn Base Data Table](https://ui.shadcn.com/docs/components/base/data-table)
- [TanStack Table releases](https://github.com/TanStack/table/releases) and
  [v9 feature composition](https://tanstack.com/table/latest/docs/guide/features)
- [TanStack row models](https://tanstack.com/table/latest/docs/guide/row-models),
  [manual pagination](https://tanstack.com/table/latest/docs/framework/react/guide/pagination),
  [sorting](https://tanstack.com/table/latest/docs/framework/react/guide/sorting), and
  [column filtering](https://tanstack.com/table/latest/docs/framework/react/guide/column-filtering)
- [Hono RPC](https://hono.dev/docs/guides/rpc) and
  [TanStack Query paginated queries](https://tanstack.com/query/v5/docs/framework/react/guides/paginated-queries)
