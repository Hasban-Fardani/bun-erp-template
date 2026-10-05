import { Inbox, type LucideIcon, SearchX, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

/**
 * Table surfaces for the states a list actually spends its life in: loading, empty, and failed.
 * A bare sentence in the middle of a card reads as a rendering bug; an icon, a title and a way
 * out read as an answer. Row skeletons also keep the layout from jumping when data lands.
 */

/** Placeholder rows sized to the real table so the first paint is not a smaller, different shape. */
/** Stable ids for placeholder shapes: index keys are banned, and these never reorder. */
const skeletonIds = (count: number): string[] => Array.from({ length: count }, (_, i) => `skeleton-${i}`);

export type TableEmptyLabels = {
  "no-data": { title: string; detail: string };
  "no-match": { title: string; detail: string };
  error: { title: string; detail: string };
};

export const DEFAULT_TABLE_EMPTY_LABELS: TableEmptyLabels = {
  "no-data": {
    title: "No data yet",
    detail: "Data will appear here after it is created.",
  },
  "no-match": {
    title: "No matches found",
    detail: "Try another search or clear the filter.",
  },
  error: {
    title: "Could not load data",
    detail: "Check your connection and try again.",
  },
};

export function TableSkeleton({
  rows = 5,
  columns,
  label = "Loading data…",
}: {
  rows?: number;
  columns: number;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      aria-busy="true"
      data-slot="table-skeleton"
      className="overflow-hidden rounded-md border border-border"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="animate-pulse">
        <div
          className="grid gap-4 border-b border-border bg-background px-4 py-3"
          style={{ gridTemplateColumns: `repeat(${Math.max(columns, 1)}, minmax(0, 1fr))` }}
        >
          {skeletonIds(Math.max(columns, 1)).map((columnId, index) => (
            <div key={columnId} className={cn("h-2.5 rounded-full bg-border", index === 0 ? "w-1/2" : "w-2/5")} />
          ))}
        </div>
        {skeletonIds(rows).map((rowId, rowIndex) => (
          <div
            key={rowId}
            className="grid items-center gap-4 border-b border-border px-4 py-3.5 last:border-0"
            style={{ gridTemplateColumns: `repeat(${Math.max(columns, 1)}, minmax(0, 1fr))` }}
          >
            {skeletonIds(Math.max(columns, 1)).map((columnId, index) => (
              <div
                key={columnId}
                className={cn(
                  "h-3.5 rounded-full bg-border",
                  index === 0
                    ? rowIndex % 2 === 0
                      ? "w-3/5"
                      : "w-2/5"
                    : (rowIndex + index) % 3 === 0
                      ? "w-1/2"
                      : "w-2/3",
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One empty-state shape for every reason a list can be empty. `action` is not decoration: an
 * empty table with no way out is a dead end, and the two causes need different fixes (clear the
 * filter vs create the first record).
 */
export function TableEmpty({
  cause,
  message,
  action,
  labels = DEFAULT_TABLE_EMPTY_LABELS,
}: {
  cause: "no-data" | "no-match" | "error";
  message?: string;
  action?: ReactNode;
  labels?: TableEmptyLabels;
}) {
  const Icon = { "no-data": Inbox, "no-match": SearchX, error: TriangleAlert }[cause];
  const preset = labels[cause];

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <Icon size={22} aria-hidden="true" className={cause === "error" ? "text-danger" : "text-ink-muted"} />
      <p className="text-sm font-medium text-ink">{message ?? preset.title}</p>
      <p className="max-w-sm text-xs text-ink-muted">{preset.detail}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export type { LucideIcon };

/**
 * Full-page loading. Used before the session is known, when there is no layout to skeleton
 * yet — a bare "Memuat…" line reads as a broken page rather than a busy one.
 */
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="min-h-[60vh] p-4" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="animate-pulse space-y-6">
        <div className="h-7 w-48 rounded-md bg-border" />
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="h-4 w-2/3 rounded-full bg-border" />
          <div className="h-10 w-full rounded-md bg-border" />
          <div className="h-10 w-full rounded-md bg-border" />
        </div>
        <div className="space-y-3 rounded-lg border border-border p-4">
          {skeletonIds(4).map((rowId) => (
            <div key={rowId} className="h-4 w-full rounded-full bg-border" />
          ))}
        </div>
      </div>
    </div>
  );
}
