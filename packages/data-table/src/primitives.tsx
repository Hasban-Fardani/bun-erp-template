"use client";

import type * as React from "react";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface TableProps extends React.ComponentProps<"table"> {
  /** Class applied to the horizontal-scroll wrapper. */
  containerClassName?: string;
}

/** Semantic, horizontally scrollable table root. Styling is opt-in via styles.css. */
export function Table({ className, containerClassName, ...props }: TableProps) {
  return (
    <div className={classes("bun-data-table__scroll", containerClassName)} data-slot="table-container">
      <table className={classes("bun-data-table", className)} data-slot="table" {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={className} data-slot="table-header" {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={className} data-slot="table-body" {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={className} data-slot="table-row" {...props} />;
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={className} data-slot="table-head" {...props} />;
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={className} data-slot="table-cell" {...props} />;
}

export interface FilterProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/** Controlled text filter, independent of TanStack state and data fetching. */
export function Filter({ value, onChange, label, placeholder, className, disabled }: FilterProps) {
  return (
    <label className={classes("bun-data-table__filter", className)} data-slot="table-filter">
      <span>{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export interface PaginationProps {
  /** Zero-based TanStack page index. */
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  rowCount: number;
  onPageIndexChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
  labels?: Partial<{
    navigation: string;
    first: string;
    previous: string;
    next: string;
    last: string;
    rowsPerPage: string;
    page: string;
    of: string;
    showing: string;
    records: string;
  }>;
}

/** Page controls for a known row count, usable with local or manually loaded rows. */
export function Pagination({
  pageIndex,
  pageSize,
  pageCount,
  rowCount,
  onPageIndexChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
  labels,
}: PaginationProps) {
  const copy = {
    navigation: "Table pagination",
    first: "First page",
    previous: "Previous page",
    next: "Next page",
    last: "Last page",
    rowsPerPage: "Rows per page",
    page: "Page",
    of: "of",
    showing: "Showing",
    records: "records",
    ...labels,
  };
  const currentPage = pageCount === 0 ? 0 : pageIndex + 1;
  const firstRow = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(rowCount, (pageIndex + 1) * pageSize);
  const sizes = pageSizeOptions.includes(pageSize) ? pageSizeOptions : [...pageSizeOptions, pageSize];
  const atStart = pageIndex <= 0;
  const atEnd = pageCount === 0 || pageIndex >= pageCount - 1;

  return (
    <nav
      className={classes("bun-data-table__pagination", className)}
      aria-label={copy.navigation}
      data-slot="table-pagination"
    >
      <p aria-live="polite" className="bun-data-table__summary">
        {copy.showing} {firstRow}–{lastRow} {copy.of} {rowCount} {copy.records}
      </p>
      <div className="bun-data-table__pagination-controls">
        <label className="bun-data-table__page-size">
          <span>{copy.rowsPerPage}</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.currentTarget.value))}>
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span aria-live="polite">
          {copy.page} {currentPage} {copy.of} {pageCount}
        </span>
        <button type="button" aria-label={copy.first} disabled={atStart} onClick={() => onPageIndexChange(0)}>
          «
        </button>
        <button
          type="button"
          aria-label={copy.previous}
          disabled={atStart}
          onClick={() => onPageIndexChange(pageIndex - 1)}
        >
          ‹
        </button>
        <button type="button" aria-label={copy.next} disabled={atEnd} onClick={() => onPageIndexChange(pageIndex + 1)}>
          ›
        </button>
        <button
          type="button"
          aria-label={copy.last}
          disabled={atEnd}
          onClick={() => onPageIndexChange(Math.max(0, pageCount - 1))}
        >
          »
        </button>
      </div>
    </nav>
  );
}
