import { Inbox, type LucideIcon, SearchX, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

/**
 * Table surfaces for the states a list actually spends its life in: loading, empty, and failed.
 * A bare sentence in the middle of a card reads as a rendering bug; an icon, a title and a way
 * out read as an answer. Row skeletons also keep the layout from jumping when data lands.
 */

/** Placeholder rows sized to the real table so the first paint is not a smaller, different shape. */
/** Stable ids for placeholder shapes: index keys are banned, and these never reorder. */
const skeletonIds = (count: number): string[] => Array.from({ length: count }, (_, i) => `skeleton-${i}`);

export function TableSkeleton({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <div aria-hidden="true" className="animate-pulse">
      {skeletonIds(rows).map((rowId) => (
        <div key={rowId} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0">
          {skeletonIds(columns).map((columnId, index) => (
            <div key={columnId} className={cn("h-3.5 rounded-full bg-border", index === 0 ? "w-40" : "w-24")} />
          ))}
        </div>
      ))}
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
}: {
  cause: "no-data" | "no-match" | "error";
  message?: string;
  action?: ReactNode;
}) {
  const preset = {
    "no-data": {
      icon: Inbox,
      title: "Belum ada data",
      detail: "Data akan muncul di sini setelah dibuat.",
    },
    "no-match": {
      icon: SearchX,
      title: "Tidak ada yang cocok",
      detail: "Coba kata kunci lain atau hapus filter.",
    },
    error: {
      icon: TriangleAlert,
      title: "Gagal memuat",
      detail: "Periksa koneksi lalu coba lagi.",
    },
  }[cause];

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <preset.icon size={22} aria-hidden="true" className={cause === "error" ? "text-danger" : "text-ink-muted"} />
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
export function PageLoading({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-border border-t-accent" />
      <span className="text-xs text-ink-muted">{label}</span>
    </div>
  );
}
