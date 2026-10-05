import { createServerColumnHelper, type ServerColumn, useServerDataTable } from "@bun-erp/data-table/server";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Button } from "../atoms/button.tsx";
import { IconButton } from "../atoms/icon-button.tsx";
import { cn } from "../lib/cn.ts";
import { useSoftAutoAnimate } from "../lib/use-auto-animate.ts";
import { SimpleSelect } from "../molecules/select.tsx";
import {
  DEFAULT_TABLE_EMPTY_LABELS,
  TableEmpty,
  type TableEmptyLabels,
  TableSkeleton,
} from "../molecules/table-states.tsx";

export type Column<T> = {
  key: string;
  header: string;
  /** Value rendered in the cell. */
  cell: (row: T) => ReactNode;
  /** Enables the sort control. Omit for columns the API does not sort by. */
  sortable?: boolean;
  /** Hidden below `md`; the value is repeated in the mobile card layout instead. */
  secondary?: boolean;
  align?: "left" | "right";
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
  /** Rendered when there is no data at all; `filtered` distinguishes "empty" from "no match". */
  /** `action` is the way out: an empty table with no next step is a dead end. */
  empty: { filtered: boolean; message?: string; action?: ReactNode };
  pending?: boolean;
  error?: string;
  /** Re-runs the failed request; the error state offers this as the way out. */
  onRetry?: () => void;
  labels?: DataTableLabels;
  /** Actions column, rendered as icons. */
  actions?: (row: T) => ReactNode;
  caption?: string;
};

export type PaginationLabels = {
  range: (first: number, last: number, total: number) => string;
  rowsPerPage: string;
  perPage: string;
  first: string;
  previous: string;
  next: string;
  last: string;
  pageStatus: (page: number, totalPages: number) => string;
};

export type DataTableLabels = {
  loading: string;
  refreshing: string;
  staleData: string;
  actions: string;
  retry: string;
  clearSearch: string;
  empty: TableEmptyLabels;
  pagination: PaginationLabels;
};

export const DEFAULT_DATA_TABLE_LABELS: DataTableLabels = {
  loading: "Loading data…",
  refreshing: "Updating data…",
  staleData: "Previously loaded data is still shown.",
  actions: "Actions",
  retry: "Try again",
  clearSearch: "Clear search",
  empty: DEFAULT_TABLE_EMPTY_LABELS,
  pagination: {
    range: (first, last, total) => `Showing ${first}–${last} of ${total}`,
    rowsPerPage: "Rows per page",
    perPage: "per page",
    first: "First page",
    previous: "Previous page",
    next: "Next page",
    last: "Last page",
    pageStatus: (page, totalPages) => `Page ${page} of ${totalPages}`,
  },
};

/**
 * Server-driven table. Sorting and paging are requested from the API rather than applied in
 * the browser, so behaviour is identical for 20 rows and 200,000.
 *
 * Desktop gets a real `<table>` (screen readers, column headers, `aria-sort`). Mobile would
 * force horizontal scrolling, so below `md` the same data renders as stacked cards — the
 * layout changes, the data and the actions do not.
 */
type TableRow<T> = { value: T };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  dir,
  onSort,
  empty,
  pending,
  error,
  onRetry,
  labels = DEFAULT_DATA_TABLE_LABELS,
  actions,
  caption,
}: DataTableProps<T>) {
  const [tableRowsRef] = useSoftAutoAnimate<HTMLTableSectionElement>();
  const [mobileRowsRef] = useSoftAutoAnimate<HTMLUListElement>();
  const tableRows = useMemo(() => rows.map((value) => ({ value })), [rows]);
  const columnHelper = useMemo(() => createServerColumnHelper<TableRow<T>>(), []);
  const definitions = useMemo<ServerColumn<TableRow<T>>[]>(
    () =>
      columnHelper.columns(
        columns.map((column) =>
          columnHelper.accessor((row) => row.value, {
            id: column.key,
            header: column.header,
            cell: ({ row }) => column.cell(row.original.value),
            enableSorting: Boolean(column.sortable),
            sortFn: "alphanumeric",
          }),
        ),
      ),
    [columns, columnHelper],
  );
  const sorting = sort ? [{ id: sort, desc: dir === "desc" }] : [];
  const table = useServerDataTable({
    data: tableRows,
    columns: definitions,
    getRowId: (row) => rowKey(row.value),
    rowCount: rows.length,
    state: {
      pagination: { pageIndex: 0, pageSize: Math.max(1, rows.length) },
      sorting,
      columnFilters: [],
      globalFilter: "",
    },
    onPaginationChange: () => {},
    onColumnFiltersChange: () => {},
    onGlobalFilterChange: () => {},
    enableSortingRemoval: false,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (next[0]) onSort(next[0].id);
    },
  });
  const renderedRows = table.getRowModel().rows.map(({ id, original }) => ({ id, original: original.value }));
  const hasRows = renderedRows.length > 0;
  if (!hasRows) {
    return (
      <TableState
        columns={columns.length + (actions ? 1 : 0)}
        error={error}
        onRetry={onRetry}
        labels={labels}
        pending={pending}
        filtered={empty.filtered}
        message={empty.message}
        action={empty.action}
      />
    );
  }

  return (
    <>
      {pending ? (
        <p role="status" aria-live="polite" className="sr-only">
          {labels.refreshing}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {labels.staleData} {error}
        </p>
      ) : null}
      <div className="enter-soft relative hidden md:block" aria-busy={pending}>
        <table className="w-full text-[13.5px]">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium tracking-wide text-ink-soft">
              {columns.map((column) => {
                const tableColumn = table.getColumn(column.key);
                const sorted = tableColumn?.getIsSorted() ?? false;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                    className={cn("px-4 py-3", column.align === "right" && "text-right")}
                  >
                    {column.sortable && tableColumn ? (
                      <SortButton
                        column={column}
                        active={sorted !== false}
                        dir={sorted === "desc" ? "desc" : "asc"}
                        onSort={() => tableColumn.toggleSorting()}
                      />
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {actions ? (
                <th scope="col" className="px-4 py-3 text-right">
                  {labels.actions}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody ref={tableRowsRef}>
            {renderedRows.map(({ id, original: row }) => (
              <tr key={id} className="border-b border-border transition-colors last:border-0 hover:bg-background">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3",
                      column.secondary && "hidden lg:table-cell",
                      column.align === "right" && "text-right",
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {actions ? (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">{actions(row)}</div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per row. Same data, same actions, no horizontal scroll. */}
      <ul
        ref={mobileRowsRef}
        className="enter-soft divide-y divide-border md:hidden"
        aria-busy={pending}
        data-testid="resource-table-mobile-list"
      >
        {renderedRows.map(({ id, original: row }) => (
          <li key={id} className="px-4 py-4" data-testid="resource-table-mobile-row">
            <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
              <div
                data-testid="resource-table-mobile-title"
                className="min-w-0 flex-1 truncate text-sm leading-6 font-semibold text-ink"
              >
                {columns[0]?.cell(row)}
              </div>
              {actions ? (
                <div
                  data-testid="resource-table-mobile-actions"
                  className="flex shrink-0 items-center justify-end gap-1 [&_button]:size-11"
                >
                  {actions(row)}
                </div>
              ) : null}
            </div>
            {columns.length > 1 ? (
              <dl className="space-y-1">
                {columns.slice(1).map((column) => (
                  <div key={column.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-x-3">
                    <dt className="min-w-0 break-words text-xs leading-5 text-ink-muted">{column.header}</dt>
                    <dd
                      data-testid="resource-table-mobile-value"
                      className="m-0 min-w-0 break-words text-xs leading-5 text-ink-soft"
                    >
                      {column.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function SortButton<T>({
  column,
  active,
  dir,
  onSort,
}: {
  column: Column<T>;
  active: boolean;
  dir: "asc" | "desc";
  onSort: () => void;
}) {
  const Icon = active && dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm -mx-1 px-1 py-0.5 outline-none transition-colors",
        "hover:text-ink focus-visible:ring-2 focus-visible:ring-accent",
        active ? "text-ink" : "text-ink-muted",
      )}
    >
      {column.header}
      {/* Only the active column shows an arrow: a faded arrow on every header reads as if
          the table were sorted by all of them at once. */}
      {active ? <Icon size={14} aria-hidden="true" /> : null}
    </button>
  );
}

type PaginationProps = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  onPerPage: (perPage: number) => void;
  labels?: PaginationLabels;
};

/** DataTables-style footer: page size, a localized range, and accessible page controls. */
export function Pagination({
  page,
  perPage,
  total,
  totalPages,
  onPage,
  onPerPage,
  labels = DEFAULT_DATA_TABLE_LABELS.pagination,
}: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-[12.5px] text-ink-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span data-testid="table-info" className="text-ink-muted">
          {labels.range(first, last, total)}
        </span>
        <SimpleSelect
          size="sm"
          className="w-[4.5rem]"
          testId="per-page"
          label={labels.rowsPerPage}
          value={String(perPage)}
          onValueChange={(v) => onPerPage(Number(v))}
          options={[10, 25, 50, 100].map((size) => ({ value: String(size), label: String(size) }))}
        />
        <span className="text-ink-muted">{labels.perPage}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-0.5" aria-live="polite">
          <IconButton icon={ChevronsLeft} label={labels.first} disabled={page <= 1} onClick={() => onPage(1)} />
          <IconButton
            icon={ChevronLeft}
            label={labels.previous}
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          />
          <span className="px-1 tabular-nums">{labels.pageStatus(page, totalPages)}</span>
          <IconButton
            icon={ChevronRight}
            label={labels.next}
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          />
          <IconButton
            icon={ChevronsRight}
            label={labels.last}
            disabled={page >= totalPages}
            onClick={() => onPage(totalPages)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The state a list shows when it has no rows to draw: loading, failed, or empty for one of two
 * reasons. Kept out of `DataTable` so the table body stays a single, readable render path.
 */
function TableState({
  columns,
  error,
  onRetry,
  pending,
  filtered,
  message,
  action,
  labels,
}: {
  columns: number;
  error?: string;
  onRetry?: () => void;
  pending?: boolean;
  filtered: boolean;
  message?: string;
  action?: ReactNode;
  labels: DataTableLabels;
}) {
  // Skeletons, not a sentence: the table keeps its shape while data lands, so the page does
  // not jump between "Memuat…" and thirty rows.
  if (pending && !error) return <TableSkeleton columns={columns} label={labels.loading} />;
  if (error) {
    return (
      <TableEmpty
        cause="error"
        message={error}
        labels={labels.empty}
        action={
          onRetry ? (
            <Button icon={RotateCcw} onClick={onRetry}>
              {labels.retry}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <TableEmpty
      cause={filtered ? "no-match" : "no-data"}
      message={filtered ? message : undefined}
      action={filtered ? undefined : action}
      labels={labels.empty}
    />
  );
}
