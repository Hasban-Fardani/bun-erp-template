import { Search } from "lucide-react";
import type { ReactNode } from "react";
import type { Paged } from "../../shared/lib/list-types.ts";
import type { useTableState } from "../../shared/lib/use-table-state.ts";
import { type Column, DataTable, Pagination } from "../../shared/ui/data-table.tsx";
import { Input } from "../../shared/ui/primitives.tsx";

type ResourceTableProps<T> = {
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Query result straight from the hook; carries items plus pagination metadata. */
  result: Paged<T> | undefined;
  /** Rendered into the query string, so the endpoint and the table agree by construction. */
  state: ReturnType<typeof useTableState>;
  searchPlaceholder?: string;
  empty: { filtered: boolean; message?: string; action?: ReactNode };
  pending?: boolean;
  error?: string;
  actions?: (row: T) => ReactNode;
  /** Extra controls next to the search box (for example an "Add" button). */
  headerExtra?: ReactNode;
  caption?: string;
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
  actions,
  headerExtra,
  caption,
}: ResourceTableProps<T>) {
  const searching = state.search.length > 0;
  const emptyState = searching ? { filtered: true, message: empty.message } : empty;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <Input
            value={state.searchDraft}
            onChange={(e) => state.setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? "Cari…"}
            aria-label={searchPlaceholder ?? "Cari"}
            data-testid="table-search"
            className="pl-7"
          />
        </div>
        {headerExtra ? <div className="ml-auto flex items-center gap-2">{headerExtra}</div> : null}
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
        />
      ) : null}
    </>
  );
}
