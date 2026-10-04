"use client";

import { type ColumnDef, type RowData, type TableOptions, useTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { localTableFeatures } from "./features";
import { Filter, Pagination, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./primitives";

type LocalTableOptions<TData extends RowData> = Omit<
  TableOptions<typeof localTableFeatures, TData>,
  | "features"
  | "columns"
  | "data"
  | "state"
  | "onPaginationChange"
  | "onSortingChange"
  | "onColumnFiltersChange"
  | "onGlobalFilterChange"
  | "manualFiltering"
  | "manualSorting"
  | "manualPagination"
  | "rowCount"
  | "pageCount"
>;

export type LocalDataTableOptions<TData extends RowData> = LocalTableOptions<TData> & {
  columns: readonly ColumnDef<typeof localTableFeatures, TData>[];
  data: readonly TData[];
};

/** Create a local table instance with client-side filtering, sorting, and pagination. */
export function useLocalDataTable<TData extends RowData>(options: LocalDataTableOptions<TData>) {
  return useTable(
    {
      ...options,
      features: localTableFeatures,
      globalFilterFn: options.globalFilterFn ?? "includesString",
    },
    (state) => state,
  );
}

export interface DataTableProps<TData extends RowData> extends Omit<LocalDataTableOptions<TData>, "data" | "columns"> {
  data: readonly TData[];
  columns: readonly ColumnDef<typeof localTableFeatures, TData>[];
  /** Number of rows per page in the local, in-memory result set. Defaults to 25. */
  initialPageSize?: number;
  pageSizeOptions?: readonly number[];
  /** A controlled global text filter. Omit to hide the filter control. */
  filter?: false | { label?: string; placeholder?: string };
  ariaLabel?: string;
  emptyMessage?: ReactNode;
  className?: string;
  tableClassName?: string;
  containerClassName?: string;
  paginationClassName?: string;
}

/**
 * Local-first, in-memory table. TanStack handles filtering, sorting, and paging
 * over the complete data array supplied by the caller.
 */
export function DataTable<TData extends RowData>({
  data,
  columns,
  initialPageSize = 25,
  pageSizeOptions,
  filter = false,
  ariaLabel = "Data table",
  emptyMessage = "No rows found.",
  className,
  tableClassName,
  containerClassName,
  paginationClassName,
  initialState,
  ...options
}: DataTableProps<TData>) {
  const table = useLocalDataTable({
    ...options,
    data,
    columns,
    initialState: {
      ...initialState,
      pagination: {
        pageIndex: 0,
        pageSize: initialPageSize,
        ...initialState?.pagination,
      },
    },
  });
  const rows = table.getRowModel().rows;
  const rowCount = table.getRowCount();
  const pageCount = table.getPageCount();
  const globalFilter = String(table.state.globalFilter ?? "");

  return (
    <div className={["bun-data-table__root", className].filter(Boolean).join(" ")} data-slot="data-table">
      {filter !== false ? (
        <Filter
          label={filter.label ?? "Filter rows"}
          placeholder={filter.placeholder ?? "Type to filter…"}
          value={globalFilter}
          onChange={(value) => table.setGlobalFilter(value)}
        />
      ) : null}
      <Table aria-label={ariaLabel} className={tableClassName} containerClassName={containerClassName}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const direction = header.column.getIsSorted();
                const sortLabel = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none";

                return (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    scope={header.colSpan > 1 ? "colgroup" : "col"}
                    aria-sort={header.column.getCanSort() ? sortLabel : undefined}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()}>
                        <table.FlexRender header={header} />
                        <span aria-hidden="true">{direction === "asc" ? " ↑" : direction === "desc" ? " ↓" : ""}</span>
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={Math.max(1, table.getAllLeafColumns().length)}>{emptyMessage}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Pagination
        className={paginationClassName}
        pageIndex={table.state.pagination.pageIndex}
        pageSize={table.state.pagination.pageSize}
        pageCount={pageCount}
        rowCount={rowCount}
        pageSizeOptions={pageSizeOptions}
        onPageIndexChange={(pageIndex) => table.setPageIndex(pageIndex)}
        onPageSizeChange={(pageSize) => table.setPageSize(pageSize)}
      />
    </div>
  );
}
