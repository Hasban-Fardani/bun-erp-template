import { Navigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Download, ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { useAuditLogs } from "../features/admin/api.ts";
import type { AuditLog } from "../features/admin/types.ts";
import { useSession } from "../features/users/api.ts";
import { relativeTime } from "../shared/lib/format.ts";
import { Badge, Card, CardHeader, EmptyState, IconButton, Input } from "../shared/ui/primitives.tsx";

const stamp = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

/** Ekspor CSV dibuat di klien dari data yang sudah terlihat — tidak ada endpoint baru. */
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

/** Jejak audit: baca-saja menurut desain (append-only), tapi tiap kejadian bisa dibedah. */
export function AuditPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const logs = useAuditLogs(search, Boolean(session.data?.authenticated));

  if (session.isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-ink-muted">Memuat…</div>;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  const permissions = session.data.permissions;
  const canRead = permissions.includes("audit.read");
  const items = logs.data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <Card>
        <CardHeader
          title="Audit"
          description={canRead ? `${logs.data?.total ?? 0} kejadian tercatat` : "Izin baca tidak dimiliki"}
          action={
            canRead ? (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search
                    size={14}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
                  />
                  <Input
                    className="w-40 pl-8 sm:w-56"
                    placeholder="Filter event…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Filter event audit"
                  />
                </div>
                <IconButton
                  icon={Download}
                  label="Ekspor CSV"
                  variant="primary"
                  disabled={items.length === 0}
                  onClick={() => download(items)}
                />
              </div>
            ) : null
          }
        />

        {!canRead ? (
          <EmptyState icon={ScrollText} message="Peran Anda tidak memiliki izin audit.read." />
        ) : logs.isPending ? (
          <EmptyState message="Memuat jejak…" />
        ) : logs.isError ? (
          <EmptyState message={`Gagal memuat: ${(logs.error as Error).message}`} />
        ) : items.length === 0 ? (
          <EmptyState icon={ScrollText} message={search ? `Tidak ada kejadian “${search}”.` : "Belum ada kejadian."} />
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((log) => {
              const open = expanded === log.id;
              return (
                <li key={log.id}>
                  <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-background/60">
                    <IconButton
                      icon={open ? ChevronDown : ChevronRight}
                      label={open ? `Tutup detail ${log.event}` : `Buka detail ${log.event}`}
                      onClick={() => setExpanded(open ? null : log.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[12.5px] font-medium">{log.event}</span>
                        <Badge>{log.actorLabel}</Badge>
                        <span className="text-[12.5px] text-ink-muted">
                          {log.subjectType}:{log.subjectId.slice(0, 8)}
                        </span>
                      </div>
                      <p className="truncate font-mono text-[11.5px] text-ink-muted">trace {log.traceId}</p>
                    </div>
                    <time className="shrink-0 text-right text-[12px] text-ink-muted" dateTime={log.createdAt}>
                      {relativeTime(log.createdAt)}
                    </time>
                  </div>

                  {open ? (
                    <div className="grid gap-3 border-t border-border/50 bg-background/50 px-4 py-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Sebelum</p>
                        <pre className="overflow-x-auto rounded-md border border-border bg-surface p-2 text-[11.5px]">
                          {JSON.stringify(log.before, null, 2) ?? "—"}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Sesudah</p>
                        <pre className="overflow-x-auto rounded-md border border-border bg-surface p-2 text-[11.5px]">
                          {JSON.stringify(log.after, null, 2) ?? "—"}
                        </pre>
                      </div>
                      <p className="text-[11.5px] text-ink-muted md:col-span-2">
                        {stamp(log.createdAt)} WIB · pelaku {log.actorLabel} · trace {log.traceId}
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
