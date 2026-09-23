import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { IconButton } from "./primitives.tsx";
import { SimpleSelect } from "./select.tsx";
import { TableEmpty, TableSkeleton } from "./table-states.tsx";

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
  /** Actions column, rendered as icons. */
  actions?: (row: T) => ReactNode;
  caption?: string;
};

/**
 * Server-driven table. Sorting and paging are requested from the API rather than applied in
 * the browser, so behaviour is identical for 20 rows and 200,000.
 *
 * Desktop gets a real `<table>` (screen readers, column headers, `aria-sort`). Mobile would
 * force horizontal scrolling, so below `md` the same data renders as stacked cards — the
 * layout changes, the data and the actions do not.
 */
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
  actions,
  caption,
}: DataTableProps<T>) {
  const hasRows = rows.length > 0;
  if (!hasRows || error) {
    return (
      <TableState
        columns={columns.length + (actions ? 1 : 0)}
        error={error}
        pending={pending}
        filtered={empty.filtered}
        message={empty.message}
        action={empty.action}
      />
    );
  }

  return (
    <>
      <div className="enter-soft relative hidden md:block" key={`desktop-${rowKey(rows[0] as T)}`}>
        <table className="w-full text-[13.5px]">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium tracking-wide text-ink-soft">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={sort === column.key ? (dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cn("px-4 py-3", column.align === "right" && "text-right")}
                >
                  {column.sortable ? (
                    <SortButton column={column} active={sort === column.key} dir={dir} onSort={onSort} />
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {actions ? (
                <th scope="col" className="px-4 py-3 text-right">
                  Aksi
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className={cn(pending && "opacity-60")}>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-border transition-colors last:border-0 hover:bg-background"
              >
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
        key={`mobile-${rowKey(rows[0] as T)}`}
        className={cn("enter-soft divide-y divide-border md:hidden", pending && "opacity-60")}
      >
        {rows.map((row) => (
          <li key={rowKey(row)} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1">
              {columns.map((column, index) => (
                <div
                  key={column.key}
                  className={cn(index === 0 ? "text-sm font-medium text-ink" : "flex gap-2 text-xs text-ink-soft")}
                >
                  {index === 0 ? (
                    column.cell(row)
                  ) : (
                    <>
                      <span className="shrink-0 text-ink-muted">{column.header}</span>
                      <span className="line-clamp-2 min-w-0">{column.cell(row)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {actions ? <div className="flex shrink-0 gap-1">{actions(row)}</div> : null}
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
  onSort: (key: string) => void;
}) {
  const Icon = active && dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(column.key)}
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
};

/** DataTables-style footer: page-size selector on one side, "1–25 of 137" and pager on the other. */
export function Pagination({ page, perPage, total, totalPages, onPage, onPerPage }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-[12.5px] text-ink-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span data-testid="table-info" className="text-ink-muted">
          {first}-{last} / {total}
        </span>
        <SimpleSelect
          size="sm"
          className="w-[4.5rem]"
          testId="per-page"
          label="Baris per halaman"
          value={String(perPage)}
          onValueChange={(v) => onPerPage(Number(v))}
          options={[10, 25, 50, 100].map((size) => ({ value: String(size), label: String(size) }))}
        />
        <span className="text-ink-muted">per halaman</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-0.5" aria-live="polite">
          <IconButton icon={ChevronsLeft} label="Halaman pertama" disabled={page <= 1} onClick={() => onPage(1)} />
          <IconButton
            icon={ChevronLeft}
            label="Halaman sebelumnya"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          />
          <span className="px-1 tabular-nums">
            {page}/{totalPages}
          </span>
          <IconButton
            icon={ChevronRight}
            label="Halaman berikutnya"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          />
          <IconButton
            icon={ChevronsRight}
            label="Halaman terakhir"
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
  pending,
  filtered,
  message,
  action,
}: {
  columns: number;
  error?: string;
  pending?: boolean;
  filtered: boolean;
  message?: string;
  action?: ReactNode;
}) {
  // Skeletons, not a sentence: the table keeps its shape while data lands, so the page does
  // not jump between "Memuat…" and thirty rows.
  if (pending && !error) return <TableSkeleton columns={columns} />;
  if (error) return <TableEmpty cause="error" message={error} />;
  return (
    <TableEmpty
      cause={filtered ? "no-match" : "no-data"}
      message={filtered ? message : undefined}
      action={filtered ? undefined : action}
    />
  );
}
