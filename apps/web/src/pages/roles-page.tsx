import { Navigate } from "@tanstack/react-router";
import { useRoleList } from "../features/admin/api.ts";
import { useSession } from "../features/users/api.ts";
import { Badge, Card, CardHeader, EmptyState } from "../shared/ui/primitives.tsx";

/** Katalog peran organisasi (butuh izin `role.read`). Read-only sampai UI kelola role ada. */
export function RolesPage() {
  const session = useSession();
  const allowed = session.data?.permissions.includes("role.read") ?? false;
  const roles = useRoleList(allowed);

  if (session.isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-ink-muted">Memuat…</div>;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <Card>
        <CardHeader
          title="Peran & Izin"
          description={allowed ? `${roles.data?.length ?? 0} peran dalam organisasi` : "Izin baca tidak dimiliki"}
        />
        {!allowed ? (
          <EmptyState message="Peran Anda tidak memiliki izin role.read." />
        ) : roles.isPending ? (
          <EmptyState message="Memuat peran…" />
        ) : roles.isError ? (
          <EmptyState message={`Gagal memuat: ${(roles.error as Error).message}`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] font-medium text-ink-muted">
                  <th className="px-4 py-2.5">Key</th>
                  <th className="px-4 py-2.5">Nama</th>
                  <th className="px-4 py-2.5">Deskripsi</th>
                  <th className="px-4 py-2.5">Jenis</th>
                </tr>
              </thead>
              <tbody>
                {roles.data?.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12.5px]">{r.key}</td>
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{r.description || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={r.isSystem ? "accent" : "neutral"}>{r.isSystem ? "Sistem" : "Kustom"}</Badge>
                    </td>
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
