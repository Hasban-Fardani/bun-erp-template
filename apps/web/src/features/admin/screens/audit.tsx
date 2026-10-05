import { useI18n } from "@bun-erp/i18n/react";
import { Badge } from "@bun-erp/ui/atoms/badge.tsx";
import { Card } from "@bun-erp/ui/atoms/card.tsx";
import { IconButton } from "@bun-erp/ui/atoms/icon-button.tsx";
import { EmptyState } from "@bun-erp/ui/molecules/empty-state.tsx";
import { PageLoading } from "@bun-erp/ui/molecules/table-states.tsx";
import type { Column } from "@bun-erp/ui/organisms/data-table.tsx";
import { ResourceTable } from "@bun-erp/ui/organisms/resource-table.tsx";
import { Sheet } from "@bun-erp/ui/organisms/sheet.tsx";
import { PageShell } from "@bun-erp/ui/templates/page-shell.tsx";
import { Download, FileSearch, ScrollText } from "lucide-react";
import { useState } from "react";
import { useResourceTableLabels } from "../../../lib/resource-table-labels.ts";
import { useTableState } from "../../../lib/use-table-state.ts";
import { useSession } from "../../identity/hooks/index.ts";
import { useAuditLogs } from "../hooks/index.ts";
import type { AuditLog } from "../types/index.ts";

/** CSV export is built client-side from data already on screen — no new endpoint. */
function toCsv(items: AuditLog[], headers: string[], formatTime: (iso: string) => string): string {
  const head = headers;
  const rows = items.map((l) => [
    formatTime(l.createdAt),
    l.event,
    l.actorLabel,
    `${l.subjectType}:${l.subjectId}`,
    l.traceId,
  ]);
  return [head, ...rows].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function download(items: AuditLog[], headers: string[], formatTime: (iso: string) => string) {
  const url = URL.createObjectURL(new Blob([toCsv(items, headers, formatTime)], { type: "text/csv;charset=utf-8" }));
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
export function AuditScreen() {
  const { t, formatRelativeTime, formatDateTime } = useI18n();
  const labels = useResourceTableLabels();
  const session = useSession();
  const table = useTableState({ defaultSort: "createdAt", defaultDir: "desc" });
  const logs = useAuditLogs(table.queryString, Boolean(session.data?.authenticated));
  const [selected, setSelected] = useState<AuditLog | null>(null);

  if (session.isPending) {
    return <PageLoading label={t("common.loading")} />;
  }
  if (!session.data?.authenticated) return null;

  const canRead = session.data.permissions.includes("audit.read");
  const items = logs.data?.items ?? [];

  const columns: Column<AuditLog>[] = [
    {
      key: "event",
      header: t("audit.column.event"),
      sortable: true,
      cell: (log) => <span className="font-mono text-[12.5px] font-medium">{log.event}</span>,
    },
    {
      key: "actorLabel",
      header: t("audit.column.actor"),
      sortable: true,
      cell: (log) => <Badge>{log.actorLabel}</Badge>,
    },
    {
      key: "subject",
      header: t("audit.column.subject"),
      secondary: true,
      cell: (log) => (
        <span className="text-[12.5px] text-ink-muted">
          {log.subjectType}:{log.subjectId.slice(0, 8)}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: t("audit.column.time"),
      sortable: true,
      align: "right",
      cell: (log) => (
        <time className="text-[12px] text-ink-muted" dateTime={log.createdAt}>
          {formatRelativeTime(log.createdAt)}
        </time>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <PageShell title={t("audit.title")}>
        <Card>
          {!canRead ? (
            <EmptyState icon={ScrollText} message={t("audit.permissionDenied")} />
          ) : (
            <ResourceTable
              caption={t("audit.caption")}
              columns={columns}
              rowKey={(log) => log.id}
              result={logs.data}
              state={table}
              pending={logs.isFetching}
              error={logs.isError ? (logs.error as Error).message : undefined}
              searchPlaceholder={t("audit.search")}
              empty={{ filtered: false, message: t("audit.empty"), noMatchMessage: t("audit.noMatch") }}
              labels={labels}
              headerExtra={
                <IconButton
                  icon={Download}
                  label={t("audit.export")}
                  variant="primary"
                  disabled={items.length === 0}
                  onClick={() =>
                    download(
                      items,
                      [
                        t("audit.csv.time"),
                        t("audit.csv.event"),
                        t("audit.csv.actor"),
                        t("audit.csv.subject"),
                        t("audit.csv.trace"),
                      ],
                      (value) => formatDateTime(value, { timeZone: "Asia/Jakarta" }),
                    )
                  }
                />
              }
              actions={(log) => (
                <IconButton
                  icon={FileSearch}
                  label={t("audit.openDetails", { event: log.event })}
                  onClick={() => setSelected(log)}
                />
              )}
            />
          )}
        </Card>

        <AuditDetail log={selected} onClose={() => setSelected(null)} />
      </PageShell>
    </div>
  );
}

/** Before/after payload of the selected event, in a drawer so the table stays scannable. */
function AuditDetail({ log, onClose }: { log: AuditLog | null; onClose: () => void }) {
  const { t, formatDateTime } = useI18n();
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
          {formatDateTime(log.createdAt, { timeZone: "Asia/Jakarta" })} {t("audit.timeZone")} · trace {log.traceId}
        </p>
        <Snapshot title={t("audit.before")} value={log.before} />
        <Snapshot title={t("audit.after")} value={log.after} />
      </div>
    </Sheet>
  );
}

function Snapshot({ title, value }: { title: string; value: AuditLog["before"] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-2 text-[11.5px]">
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
