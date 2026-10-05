import { Input } from "@bun-erp/ui/atoms/input.tsx";
import {
  type Column,
  DataTable,
  type DataTableLabels,
  DEFAULT_DATA_TABLE_LABELS,
  Pagination,
} from "@bun-erp/ui/organisms/data-table.tsx";
import { Loader2, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import type { Paged } from "../types/list.ts";

type ResourceTableProps<T> = {
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Query result straight from the hook; carries items plus pagination metadata. */
  result: Paged<T> | undefined;
  /** Rendered into the query string, so the endpoint and the table agree by construction. */
  state: {
    search: string;
    searchDraft: string;
    sort: string;
    dir: "asc" | "desc";
    setSearch: (value: string) => void;
    clearSearch: () => void;
    setSort: (column: string) => void;
    setPage: (page: number) => void;
    setPerPage: (perPage: number) => void;
  };
  searchPlaceholder?: string;
  empty: { filtered: boolean; message?: string; noMatchMessage?: string; action?: ReactNode };
  pending?: boolean;
  error?: string;
  /** Re-runs the failed request; rendered as the error state's way out. */
  onRetry?: () => void;
  actions?: (row: T) => ReactNode;
  /** Extra controls next to the search box (for example an "Add" button). */
  headerExtra?: ReactNode;
  caption?: string;
  labels?: DataTableLabels;
};

/**
 * The list half of every admin screen: search box, sortable server-paged table, pagination
 * footer. Built once so a new resource cannot ship without paging or sorting — the earlier
 * hand-written pages each reimplemented this and silently lost both.
 */
export function ResourceTable<T>({
  columns,
  rowKey,
  result,
  state,
  searchPlaceholder,
  empty,
  pending,
  error,
  onRetry,
  actions,
  headerExtra,
  caption,
  labels = DEFAULT_DATA_TABLE_LABELS,
}: ResourceTableProps<T>) {
  const searching = state.search.length > 0;
  const emptyState = searching ? { filtered: true, message: empty.noMatchMessage ?? empty.message } : empty;

  return (
    <>
      <div
        data-testid="resource-table-toolbar"
        className="grid grid-cols-1 items-stretch gap-3 border-b border-border px-4 py-3 md:flex md:flex-wrap md:items-center md:gap-2"
      >
        <div className="relative w-full min-w-0 md:flex-1 md:max-w-xs">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <Input
            value={state.searchDraft}
            onChange={(e) => state.setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? "Search…"}
            aria-label={searchPlaceholder ?? "Search"}
            data-testid="table-search"
            className="pl-7 pr-8"
          />
          {state.searchDraft ? (
            <button
              type="button"
              onClick={state.clearSearch}
              aria-label={labels.clearSearch}
              title={labels.clearSearch}
              data-testid="table-search-clear"
              className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-ink-muted outline-none hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {pending ? (
          <span
            role="status"
            aria-live="polite"
            data-testid="table-refreshing"
            className="inline-flex items-center justify-center gap-1.5 text-[12px] text-ink-muted md:ml-auto"
          >
            <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden="true" />
            {labels.refreshing}
          </span>
        ) : null}
        {headerExtra ? (
          <div
            className={cn(
              "flex w-full min-w-0 items-center gap-2 md:w-auto",
              "[&>button]:min-h-11 [&>button]:w-full md:[&>button]:min-h-8 md:[&>button]:w-auto",
              pending ? "" : "md:ml-auto",
            )}
          >
            {headerExtra}
          </div>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={result?.items ?? []}
        rowKey={rowKey}
        sort={state.sort}
        dir={state.dir}
        onSort={state.setSort}
        empty={emptyState}
        pending={pending}
        error={error}
        onRetry={onRetry}
        labels={labels}
        actions={actions}
        caption={caption}
      />

      {result ? (
        <Pagination
          page={result.page}
          perPage={result.perPage}
          total={result.total}
          totalPages={result.totalPages}
          onPage={state.setPage}
          onPerPage={state.setPerPage}
          labels={labels.pagination}
        />
      ) : null}
    </>
  );
}
