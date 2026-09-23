import { Navigate } from "@tanstack/react-router";
import { Download, FileSearch, ScrollText } from "lucide-react";
import { useState } from "react";
import { useAuditLogs } from "../features/admin/api.ts";
import { ResourceTable } from "../features/admin/resource-table.tsx";
import type { AuditLog } from "../features/admin/types.ts";
import { useSession } from "../features/users/api.ts";
import { relativeTime } from "../shared/lib/format.ts";
import { useTableState } from "../shared/lib/use-table-state.ts";
import type { Column } from "../shared/ui/data-table.tsx";
import { Badge, Card, EmptyState, IconButton } from "../shared/ui/primitives.tsx";
import { Sheet } from "../shared/ui/sheet.tsx";
import { PageLoading } from "../shared/ui/table-states.tsx";

const stamp = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

/** CSV export is built client-side from data already on screen — no new endpoint. */
function toCsv(items: AuditLog[]): string {
  const head = ["waktu", "event", "pelaku", "subjek", "trace"];
  const rows = items.map((l) => [
    stamp(l.createdAt),
    l.event,
    l.actorLabel,
    `${l.subjectType}:${l.subjectId}`,
    l.traceId,
  ]);
  return [head, ...rows].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function download(items: AuditLog[]) {
  const url = URL.createObjectURL(new Blob([toCsv(items)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Audit trail: read-only by design (append-only), yet every event can be drilled into.
 * Sorting is server-side on `createdAt`, `event`, and `actorLabel`.
 */
export function AuditPage() {
  const session = useSession();
  const table = useTableState({ defaultSort: "createdAt", defaultDir: "desc" });
  const logs = useAuditLogs(table.queryString, Boolean(session.data?.authenticated));
  const [selected, setSelected] = useState<AuditLog | null>(null);

  if (session.isPending) {
    return <PageLoading label="Menyiapkan…" />;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  const canRead = session.data.permissions.includes("audit.read");
  const items = logs.data?.items ?? [];

  const columns: Column<AuditLog>[] = [
    {
      key: "event",
      header: "Kejadian",
      sortable: true,
      cell: (log) => <span className="font-mono text-[12.5px] font-medium">{log.event}</span>,
    },
    { key: "actorLabel", header: "Pelaku", sortable: true, cell: (log) => <Badge>{log.actorLabel}</Badge> },
    {
      key: "subject",
      header: "Subjek",
      secondary: true,
      cell: (log) => (
        <span className="text-[12.5px] text-ink-muted">
          {log.subjectType}:{log.subjectId.slice(0, 8)}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Waktu",
      sortable: true,
      align: "right",
      cell: (log) => (
        <time className="text-[12px] text-ink-muted" dateTime={log.createdAt}>
          {relativeTime(log.createdAt)}
        </time>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <Card>
        {!canRead ? (
          <EmptyState icon={ScrollText} message="Riwayat aktivitas hanya terbuka untuk pemilik dan pengelola." />
        ) : (
          <ResourceTable
            caption="Jejak audit organisasi"
            columns={columns}
            rowKey={(log) => log.id}
            result={logs.data}
            state={table}
            pending={logs.isPending}
            error={logs.isError ? (logs.error as Error).message : undefined}
            searchPlaceholder="Filter event…"
            empty={{ filtered: false, message: "Belum ada kejadian." }}
            headerExtra={
              <IconButton
                icon={Download}
                label="Ekspor CSV"
                variant="primary"
                disabled={items.length === 0}
                onClick={() => download(items)}
              />
            }
            actions={(log) => (
              <IconButton icon={FileSearch} label={`Detail ${log.event}`} onClick={() => setSelected(log)} />
            )}
          />
        )}
      </Card>

      <AuditDetail log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/** Before/after payload of the selected event, in a drawer so the table stays scannable. */
function AuditDetail({ log, onClose }: { log: AuditLog | null; onClose: () => void }) {
  if (!log) return null;
  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : onClose())} side="right" title={log.event}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{log.actorLabel}</Badge>
          <span className="text-[12.5px] text-ink-muted">
            {log.subjectType}:{log.subjectId}
          </span>
        </div>
        <p className="text-[12px] text-ink-muted">
          {stamp(log.createdAt)} WIB · trace {log.traceId}
        </p>
        <Snapshot title="Sebelum" value={log.before} />
        <Snapshot title="Sesudah" value={log.after} />
      </div>
    </Sheet>
  );
}

function Snapshot({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-2 text-[11.5px]">
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
