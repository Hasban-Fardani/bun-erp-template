import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSession, useUsers } from "../features/users/api.ts";
import { relativeTime } from "../shared/lib/format.ts";
import { Badge, Card, CardHeader, EmptyState, Input } from "../shared/ui/primitives.tsx";

/** Layar admin pertama: daftar pengguna organisasi (butuh izin `user.read`). */
export function UsersPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const users = useUsers(search);

  if (session.isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-ink-muted">Memuat…</div>;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  const canRead = session.data.permissions.includes("user.read");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <Card>
        <CardHeader
          title="Pengguna"
          description={canRead ? `${users.data?.total ?? 0} pengguna dalam organisasi` : "Izin baca tidak dimiliki"}
          action={
            canRead ? (
              <Input
                className="w-56"
                placeholder="Cari nama atau email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Cari pengguna"
              />
            ) : null
          }
        />

        {!canRead ? (
          <EmptyState message="Peran Anda tidak memiliki izin user.read. Minta owner menjalankan: bun erp user:grant <email> owner" />
        ) : users.isPending ? (
          <EmptyState message="Memuat pengguna…" />
        ) : users.isError ? (
          <EmptyState message={`Gagal memuat: ${(users.error as Error).message}`} />
        ) : users.data.items.length === 0 ? (
          <EmptyState message={search ? `Tidak ada hasil untuk “${search}”.` : "Belum ada pengguna."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] font-medium text-ink-muted">
                  <th className="px-4 py-2.5">Nama</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Peran</th>
                  <th className="px-4 py-2.5">Email terverifikasi</th>
                  <th className="px-4 py-2.5 text-right">Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{u.name}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? <span className="text-ink-muted">—</span> : null}
                        {u.roles.map((r) => (
                          <Badge key={r.roleId} tone={r.key === "owner" ? "accent" : "neutral"}>
                            {r.key}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.emailVerified ? (
                        <span className="text-accent">Terverifikasi</span>
                      ) : (
                        <span className="text-ink-muted">Belum</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink-muted">{relativeTime(u.createdAt)}</td>
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
