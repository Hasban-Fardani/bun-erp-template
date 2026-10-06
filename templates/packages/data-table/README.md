# `@bun-erp/data-table`

Typed React table primitives built on TanStack Table v9. The default `DataTable` is local-first: it receives a complete in-memory array and applies filtering, sorting, and pagination in the browser. “Local-first” here describes where table operations run; it does not add persistence, offline storage, or synchronization.

```tsx
import { Column, DataTable } from "@bun-erp/data-table";

type Person = { id: string; name: string; email: string };

const column = Column<Person>();
const columns = column.columns([
  column.accessor("name", { header: "Name" }),
  column.accessor("email", { header: "Email" }),
]);

<DataTable
  ariaLabel="People"
  data={people}
  columns={columns}
  getRowId={(person) => person.id}
  filter={{ label: "Search people" }}
/>
```

For manually loaded rows, import `useServerDataTable` and `createServerColumnHelper` from `@bun-erp/data-table/server`. The adapter accepts controlled table state, callbacks, the loaded rows, and the total matching `rowCount`. It does not fetch data or depend on Hono or TanStack Query. See [the usage guide](./docs/usage.md) for a complete query integration recipe.

The semantic primitives `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Filter`, and `Pagination` can be composed independently. Import `@bun-erp/data-table/styles.css` for a small neutral baseline; styling is otherwise opt-in.

## Exports

- `@bun-erp/data-table`: local feature preset, typed `Column` helper, `DataTable`, local table hook, and semantic primitives.
- `@bun-erp/data-table/local`: only the local hook, renderer, and column helper.
- `@bun-erp/data-table/primitives`: semantic table, filter, and pagination primitives without the TanStack adapter import.
- `@bun-erp/data-table/server`: manual/server feature preset, typed server column helper, state type, and `useServerDataTable` contract.
- `@bun-erp/data-table/server-table`: app-facing server `DataTable`, `Column<T>`, `DataTableLabels`, and `Pagination` for screens that own the toolbar. Composes `@bun-erp/ui` atoms and molecules.
- `@bun-erp/data-table/resource-table`: shared `ResourceTable` list frame (search, sortable server paging, pagination footer, list states). Composes `@bun-erp/ui` and `server-table`.
- `@bun-erp/data-table/styles.css`: opt-in neutral styles.
- `@bun-erp/data-table/llms.txt`: concise model-oriented package map.

## Limits

Local filtering, sorting, and pagination operate on the complete array supplied to `DataTable`. Use manual/server mode when the full set is too large to fetch or process in the browser. Virtualization is intentionally not bundled; if needed, compose TanStack Virtual with the returned table rows.
