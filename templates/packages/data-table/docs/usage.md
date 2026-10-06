# Table usage

## Local in-memory table

`DataTable` is the smallest path when the caller already has the full, bounded set of rows. It uses an opt-in TanStack feature set with client-side filtering, sorting, and pagination. Set `filter` to show a global text input. `initialPageSize` defaults to 25; use `getRowId` when rows have a stable key.

```tsx
import { Column, DataTable } from "@bun-erp/data-table";

type Department = { id: string; name: string; code: string };
const departmentColumn = Column<Department>();
const columns = departmentColumn.columns([
  departmentColumn.accessor("code", { header: "Code" }),
  departmentColumn.accessor("name", { header: "Department" }),
]);

export function DepartmentTable({ rows }: { rows: Department[] }) {
  return (
    <DataTable
      ariaLabel="Departments"
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      filter={{ label: "Search departments", placeholder: "Name or code" }}
      initialPageSize={25}
    />
  );
}
```

`Column<T>()` is a factory for TanStack's type-safe column helper. `createColumnHelper<T>()` is available as the equivalent lower-case name. Columns and data should have stable references between renders, as TanStack reprocesses row models when the input references change.

Local-first means in-memory table operations. It does not persist rows or filter state, write to local storage, or provide offline synchronization. Persistence is an app-level concern.

## Compose the primitives

`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, and `TableCell` are semantic HTML wrappers. `Filter` accepts a controlled string value; `Pagination` accepts a known count and page callbacks. They do not require TanStack Table, Hono, or a fetching library.

```tsx
import { Filter, Pagination, Table, TableBody, TableCell, TableHeader, TableRow } from "@bun-erp/data-table/primitives";

<Filter label="Search" value={search} onChange={setSearch} />
<Table aria-label="Current results">
  <TableHeader>{/* application-owned headers */}</TableHeader>
  <TableBody>{/* application-owned rows */}</TableBody>
</Table>
<Pagination
  pageIndex={pageIndex}
  pageSize={pageSize}
  pageCount={pageCount}
  rowCount={rowCount}
  onPageIndexChange={setPageIndex}
  onPageSizeChange={setPageSize}
/>
```

Import `@bun-erp/data-table/styles.css` to use the package's neutral baseline. The stylesheet is optional and does not use app-specific design tokens.

## Manual rows with Hono RPC and TanStack Query

The `server` entry exposes `useServerDataTable` with manual pagination, sorting, and filtering enabled and no client-side row models. It requires externally loaded rows, the total matching `rowCount`, controlled state, and each matching change callback. The adapter does not import Hono, React Query, or application server types.

The example below shows the boundary: the application owns `hc<AppType>`, query keys, request mapping, response/error handling, loading state, and page resets; the table package owns only table state behavior and typed TanStack wiring. Adjust the route path and API fields to match the app's chained Hono route type.

```tsx
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { hc } from "hono/client";
import type { ColumnFiltersState, PaginationState, SortingState } from "@tanstack/react-table";
import { Filter, Pagination, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bun-erp/data-table/primitives";
import { createServerColumnHelper, useServerDataTable } from "@bun-erp/data-table/server";
import type { AppType } from "@/server/features";

type Person = { id: string; name: string; email: string };
type PeoplePage = { rows: Person[]; rowCount: number };

const rpc = hc<AppType>("/", { init: { credentials: "include" } });
const personColumn = createServerColumnHelper<Person>();
const columns = personColumn.columns([
  personColumn.accessor("name", { header: "Name", sortFn: "alphanumeric" }),
  personColumn.accessor("email", { header: "Email" }),
]);

export function PeopleTable() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const peopleQuery = useQuery({
    queryKey: ["people", { pagination, sorting, columnFilters, globalFilter }],
    queryFn: async ({ signal }): Promise<PeoplePage> => {
      const response = await rpc.api.v1.people.$get(
        {
          query: {
            page: String(pagination.pageIndex + 1),
            perPage: String(pagination.pageSize),
            sort: JSON.stringify(sorting.map(({ id, desc }) => ({ id, direction: desc ? "desc" : "asc" }))),
            filters: JSON.stringify(columnFilters),
            search: globalFilter,
          },
        },
        { init: { signal } },
      );
      if (!response.ok) throw new Error(`People request failed (${response.status})`);
      return response.json();
    },
    placeholderData: keepPreviousData,
  });

  const table = useServerDataTable({
    data: peopleQuery.data?.rows ?? [],
    rowCount: peopleQuery.data?.rowCount ?? 0,
    columns,
    getRowId: (person) => person.id,
    state: { pagination, sorting, columnFilters, globalFilter },
    onPaginationChange: setPagination,
    onSortingChange: (updater) => {
      setSorting(updater);
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    },
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater);
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    },
    onGlobalFilterChange: (updater) => {
      setGlobalFilter((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        return String(next ?? "");
      });
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    },
  });

  return (
    <section aria-busy={peopleQuery.isFetching}>
      <Filter
        label="Search people"
        value={globalFilter}
        onChange={(value) => table.setGlobalFilter(value)}
      />
      <Table aria-label="People">
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder ? null : (
                    <button type="button" onClick={header.column.getToggleSortingHandler()}>
                      <table.FlexRender header={header} />
                    </button>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}><table.FlexRender cell={cell} /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        pageIndex={table.state.pagination.pageIndex}
        pageSize={table.state.pagination.pageSize}
        pageCount={table.getPageCount()}
        rowCount={table.getRowCount()}
        onPageIndexChange={(pageIndex) => table.setPageIndex(pageIndex)}
        onPageSizeChange={(pageSize) => table.setPageSize(pageSize)}
      />
    </section>
  );
}
```

The Hono client passes request cancellation through `init.signal`; TanStack Query includes every result-shaping state slice in its query key and keeps the prior page during a transition. Because manual pagination disables automatic client row-model resets, the example explicitly resets to page zero when sort/filter inputs change. For cursor APIs without a total, keep `hasNextPage` from the response in app state and gate the Next action with it; a table cannot infer the end of an unknown-length result set.

The server adapter's controlled callback types accept TanStack `Updater<T>` values. React state setters work directly for a single slice; wrap sorting/filtering handlers when the app also needs to reset page state or update URL state.

## Choosing the mode

- Use local mode when the complete set is bounded and appropriate to keep in browser memory. Filtering, sorting, and paging all apply to the complete provided array.
- Use manual mode when a query loads a page from an API. The `data` prop is only that page, while `rowCount` is the total matching set.
- Pagination in this package is offset/page-index based. Keep cursor translation and cursor-specific next-page knowledge in the application adapter.
- Virtualization is separate from pagination and is not bundled. TanStack's own guidance treats `@tanstack/react-virtual` as a separate optional library.

## Source notes

The React renderer follows the official [shadcn Base Data Table](https://ui.shadcn.com/docs/components/base/data-table) direction: keep table behavior composable and tailor the data/loading boundary to the application. Feature selection and row-model registration follow TanStack's official [feature](https://tanstack.com/table/latest/docs/guide/features), [row model](https://tanstack.com/table/latest/docs/guide/row-models), [pagination](https://tanstack.com/table/latest/docs/framework/react/guide/pagination), and [composable table](https://tanstack.com/table/latest/docs/framework/react/guide/composable-tables) guides. The typed RPC example follows [Hono's RPC guide](https://hono.dev/docs/guides/rpc); the Query lifecycle follows [TanStack Query's paginated queries guide](https://tanstack.com/query/v5/docs/framework/react/guides/paginated-queries).
