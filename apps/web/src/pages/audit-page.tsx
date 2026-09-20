import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuditLogs } from "../features/admin/api.ts";
import { useSession } from "../features/users/api.ts";
import { relativeTime } from "../shared/lib/format.ts";
import { Card, CardHeader, EmptyState, Input } from "../shared/ui/primitives.tsx";

/** Jejak audit organisasi (butuh izin `audit.read`). Append-only — hanya baca. */
export function AuditPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const allowed = session.data?.permissions.includes("audit.read") ?? false;
  const logs = useAuditLogs(search, allowed);

  if (session.isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-ink-muted">Memuat…</div>;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <Card>
        <CardHeader
          title="Audit"
          description={allowed ? `${logs.data?.total ?? 0} kejadian tercatat` : "Izin baca tidak dimiliki"}
          action={
            allowed ? (
              <Input
                className="w-44 sm:w-56"
                placeholder="Filter event (mis. user.)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Filter event audit"
              />
            ) : null
          }
        />
        {!allowed ? (
          <EmptyState message="Peran Anda tidak memiliki izin audit.read." />
        ) : logs.isPending ? (
          <EmptyState message="Memuat jejak audit…" />
        ) : logs.isError ? (
          <EmptyState message={`Gagal memuat: ${(logs.error as Error).message}`} />
        ) : logs.data.items.length === 0 ? (
          <EmptyState message={search ? `Tidak ada event cocok “${search}”.` : "Belum ada catatan audit."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] font-medium text-ink-muted">
                  <th className="px-4 py-2.5">Event</th>
                  <th className="px-4 py-2.5">Pelaku</th>
                  <th className="px-4 py-2.5">Subjek</th>
                  <th className="px-4 py-2.5 text-right">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {logs.data.items.map((l) => (
                  <tr key={l.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12.5px]">{l.event}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{l.actorLabel || "—"}</td>
                    <td className="px-4 py-2.5 text-ink-soft">
                      {l.subjectType}
                      {l.subjectId ? <span className="text-ink-muted"> · {l.subjectId.slice(0, 8)}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink-muted">{relativeTime(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
