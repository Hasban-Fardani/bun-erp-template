"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  createColumnHelper as createTanStackColumnHelper,
  type OnChangeFn,
  type PaginationState,
  type RowData,
  type SortingState,
  type TableOptions,
  type TableState,
  useTable,
} from "@tanstack/react-table";
import { serverTableFeatures } from "./server-features";

export type ServerColumn<TData extends RowData> = ColumnDef<typeof serverTableFeatures, TData>;

export type ServerTableState = Pick<
  TableState<typeof serverTableFeatures>,
  "pagination" | "sorting" | "columnFilters" | "globalFilter"
>;

type ServerTableOptions<TData extends RowData> = Omit<
  TableOptions<typeof serverTableFeatures, TData>,
  | "features"
  | "columns"
  | "data"
  | "rowCount"
  | "pageCount"
  | "manualFiltering"
  | "manualSorting"
  | "manualPagination"
  | "initialState"
  | "state"
  | "onPaginationChange"
  | "onSortingChange"
  | "onColumnFiltersChange"
  | "onGlobalFilterChange"
>;

/**
 * Contract for rows fetched elsewhere. State and callbacks are required so
 * pagination, sorting, and filtering can be reflected in the caller's query.
 */
export type ServerDataTableOptions<TData extends RowData> = ServerTableOptions<TData> & {
  data: readonly TData[];
  columns: readonly ServerColumn<TData>[];
  /** Total matching rows reported by the data source, not the loaded page size. */
  rowCount: number;
  state: ServerTableState;
  onPaginationChange: OnChangeFn<PaginationState>;
  onSortingChange: OnChangeFn<SortingState>;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  onGlobalFilterChange: OnChangeFn<ServerTableState["globalFilter"]>;
};

/** Create a typed helper whose column options match the server/manual feature set. */
export function createServerColumnHelper<TData extends RowData>() {
  return createTanStackColumnHelper<typeof serverTableFeatures, TData>();
}

/**
 * Build a manually controlled table over externally loaded rows. It performs
 * no fetching and deliberately omits client-side filtering/sorting/pagination.
 */
export function useServerDataTable<TData extends RowData>(options: ServerDataTableOptions<TData>) {
  return useTable(
    {
      ...options,
      features: serverTableFeatures,
      manualFiltering: true,
      manualSorting: true,
      manualPagination: true,
    },
    (state) => state,
  );
}
