import { Navigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useCreateUser, useDeleteUser, useRoles, useSession, useUsers } from "../features/users/api.ts";
import { ApiError } from "../lib/api.ts";
import { relativeTime } from "../shared/lib/format.ts";
import { Badge, Button, Card, CardHeader, EmptyState, Input } from "../shared/ui/primitives.tsx";
import { Sheet } from "../shared/ui/sheet.tsx";

const inputClass = "w-full";

/** Layar admin pertama: daftar, tambah, dan hapus pengguna organisasi. */
export function UsersPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const users = useUsers(search);
  const roles = useRoles();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();

  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleKey, setRoleKey] = useState("staff");

  if (session.isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-ink-muted">Memuat…</div>;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  const permissions = session.data.permissions;
  const canRead = permissions.includes("user.read");
  const canCreate = permissions.includes("user.create");
  const canDelete = permissions.includes("user.delete");
  const roleOptions = roles.data?.length
    ? roles.data
    : [
        { key: "owner", name: "Owner" },
        { key: "staff", name: "Staff" },
      ];

  const openForm = () => {
    setFormError("");
    setFormOpen(true);
  };

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    createUser.mutate(
      { name, email, password, roleKey: roleKey || undefined },
      {
        onSuccess: () => {
          setFormOpen(false);
          setName("");
          setEmail("");
          setPassword("");
          setRoleKey("staff");
        },
        onError: (err) => setFormError(err instanceof ApiError ? err.message : "Gagal menambah pengguna"),
      },
    );
  };

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
                {canCreate ? <Button onClick={openForm}>Tambah</Button> : null}
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

      <Sheet open={formOpen} onOpenChange={setFormOpen} className="p-5">
        <form onSubmit={submitForm} className="flex flex-col gap-4" aria-label="Form tambah pengguna">
          <h2 className="text-[15px] font-semibold">Tambah Pengguna</h2>

          <label htmlFor="user-name" className="flex flex-col gap-1.5 text-[12.5px] font-medium text-ink-soft">
            Nama
            <Input
              id="user-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </label>

          <label htmlFor="user-email" className="flex flex-col gap-1.5 text-[12.5px] font-medium text-ink-soft">
            Email
            <Input
              id="user-email"
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label htmlFor="user-password" className="flex flex-col gap-1.5 text-[12.5px] font-medium text-ink-soft">
            Sandi awal (min. 10 karakter)
            <Input
              id="user-password"
              className={inputClass}
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="off"
            />
          </label>

          <label htmlFor="user-role" className="flex flex-col gap-1.5 text-[12.5px] font-medium text-ink-soft">
            Peran
            <select
              id="user-role"
              className={`${inputClass} h-10 rounded-lg border border-border bg-surface px-3 text-[13.5px] text-ink outline-none focus:border-accent`}
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
            >
              {roleOptions.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          {formError ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {formError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
