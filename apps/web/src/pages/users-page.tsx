import { Navigate } from "@tanstack/react-router";
import { Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { ResourceTable } from "../features/admin/resource-table.tsx";
import { useDeleteUser, useSession, useUpdateUser, useUsers } from "../features/users/api.ts";
import type { PublicUser } from "../features/users/types.ts";
import { UserSheet } from "../features/users/user-sheet.tsx";
import { ApiError } from "../lib/api.ts";
import { relativeTime } from "../shared/lib/format.ts";
import { useTableState } from "../shared/lib/use-table-state.ts";
import type { Column } from "../shared/ui/data-table.tsx";
import { Badge, Button, Card, ConfirmDelete, IconButton } from "../shared/ui/primitives.tsx";
import { PageLoading } from "../shared/ui/table-states.tsx";
import { useToast } from "../shared/ui/toast.tsx";

const columns: Column<PublicUser>[] = [
  { key: "name", header: "Nama", sortable: true, cell: (u) => <span className="font-medium">{u.name}</span> },
  { key: "email", header: "Email", sortable: true, cell: (u) => <span className="text-ink-soft">{u.email}</span> },
  {
    key: "roles",
    header: "Peran",
    cell: (u) =>
      u.roles.length === 0 ? (
        <span className="text-ink-muted">—</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <Badge key={r.roleId} tone={r.key === "owner" ? "accent" : "neutral"}>
              {r.key}
            </Badge>
          ))}
        </span>
      ),
  },
  {
    key: "emailVerified",
    header: "Verifikasi",
    secondary: true,
    cell: (u) =>
      u.emailVerified ? (
        <span className="text-accent">Terverifikasi</span>
      ) : (
        <span className="text-ink-muted">Belum</span>
      ),
  },
  {
    key: "createdAt",
    header: "Dibuat",
    sortable: true,
    secondary: true,
    align: "right",
    cell: (u) => relativeTime(u.createdAt),
  },
];

/** Administration screen for organisation members: list, add, edit, delete. */
export function UsersPage() {
  const session = useSession();
  const table = useTableState({ defaultSort: "name", searchDelay: 300 });
  const users = useUsers(table.queryString);
  const deleteUser = useDeleteUser();
  const updateUser = useUpdateUser();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const toast = useToast();

  if (session.isPending) return <Loading />;
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  const permissions = session.data.permissions;
  const canRead = permissions.includes("user.read");
  const canWrite = permissions.includes("user.update");
  const canCreate = permissions.includes("user.create");
  const canDelete = permissions.includes("user.delete");

  if (!canRead) {
    return (
      <Shell>
        <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
          Daftar pengguna hanya terbuka untuk pemilik dan pengelola.
        </p>
      </Shell>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <Shell>
      <Card>
        <ResourceTable
          caption="Daftar pengguna organisasi"
          columns={columns}
          rowKey={(u) => u.id}
          result={users.data}
          state={table}
          pending={users.isPending}
          error={users.isError ? (users.error as Error).message : undefined}
          searchPlaceholder="Cari nama atau email…"
          empty={{ filtered: false, message: "Belum ada pengguna." }}
          headerExtra={
            canCreate ? (
              <Button icon={UserPlus} onClick={openCreate}>
                Tambah
              </Button>
            ) : null
          }
          actions={
            canWrite || canDelete
              ? (u) => (
                  <>
                    {canWrite ? (
                      <IconButton
                        icon={Pencil}
                        label={`Ubah ${u.name}`}
                        onClick={() => {
                          setEditing(u);
                          setFormOpen(true);
                        }}
                      />
                    ) : null}
                    {canDelete ? (
                      <ConfirmDelete
                        label={u.email}
                        disabled={deleteUser.isPending}
                        onConfirm={() =>
                          deleteUser.mutate(u.id, {
                            onSuccess: () => toast.success("Pengguna dihapus"),
                            onError: (err) =>
                              toast.error(err instanceof ApiError ? err.message : "Gagal menghapus pengguna"),
                          })
                        }
                      />
                    ) : null}
                  </>
                )
              : undefined
          }
        />
      </Card>

      <UserSheet
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editing}
        onSave={(input) => {
          if (!editing) return;
          updateUser.mutate(
            { id: editing.id, ...input },
            {
              onSuccess: () => setFormOpen(false),
              onError: (err) => toast.error(err instanceof ApiError ? err.message : "Gagal menyimpan"),
            },
          );
        }}
        saving={updateUser.isPending}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 lg:px-8">{children}</div>;
}

function Loading() {
  return <PageLoading label="Menyiapkan…" />;
}
