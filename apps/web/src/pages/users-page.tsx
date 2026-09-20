import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDeleteUser, useSession, useUsers } from "../features/users/api.ts";
import { CreateUserSheet } from "../features/users/create-user-sheet.tsx";
import { ApiError } from "../lib/api.ts";
import { relativeTime } from "../shared/lib/format.ts";
import { Badge, Button, Card, CardHeader, EmptyState, Input } from "../shared/ui/primitives.tsx";

/** Layar admin pertama: daftar, tambah, dan hapus pengguna organisasi. */
export function UsersPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const users = useUsers(search);
  const deleteUser = useDeleteUser();
  const [formOpen, setFormOpen] = useState(false);

  if (session.isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-ink-muted">Memuat…</div>;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  const permissions = session.data.permissions;
  const canRead = permissions.includes("user.read");
  const canCreate = permissions.includes("user.create");
  const canDelete = permissions.includes("user.delete");

  const removeUser = (id: string, userEmail: string) => {
    if (!window.confirm(`Hapus pengguna ${userEmail}? Sesi dan kredensialnya ikut dihapus.`)) return;
    deleteUser.mutate(id, {
      onError: (err) => window.alert(err instanceof ApiError ? err.message : "Gagal menghapus"),
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <Card>
        <CardHeader
          title="Pengguna"
          description={canRead ? `${users.data?.total ?? 0} pengguna dalam organisasi` : "Izin baca tidak dimiliki"}
          action={
            canRead ? (
              <div className="flex items-center gap-2">
                <Input
                  className="w-44 sm:w-56"
                  placeholder="Cari nama atau email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Cari pengguna"
                />
                {canCreate ? <Button onClick={() => setFormOpen(true)}>Tambah</Button> : null}
              </div>
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
                  <th className="hidden px-4 py-2.5 md:table-cell">Email terverifikasi</th>
                  <th className="hidden px-4 py-2.5 text-right md:table-cell">Dibuat</th>
                  {canDelete ? <th className="px-4 py-2.5 text-right">Aksi</th> : null}
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
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      {u.emailVerified ? (
                        <span className="text-accent">Terverifikasi</span>
                      ) : (
                        <span className="text-ink-muted">Belum</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-ink-muted md:table-cell">
                      {relativeTime(u.createdAt)}
                    </td>
                    {canDelete ? (
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          onClick={() => removeUser(u.id, u.email)}
                          disabled={deleteUser.isPending}
                          aria-label={`Hapus ${u.email}`}
                        >
                          Hapus
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateUserSheet open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
