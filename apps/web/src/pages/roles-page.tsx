import { Navigate } from "@tanstack/react-router";
import { KeyRound, Pencil, ShieldCheck, ShieldPlus } from "lucide-react";
import { useState } from "react";
import {
  useCreateRole,
  useDeleteRole,
  useRoleList,
  useSetRolePermissions,
  useUpdateRole,
} from "../features/admin/api.ts";
import { ResourceTable } from "../features/admin/resource-table.tsx";
import { RolePermissionSheet, RoleSheet } from "../features/admin/role-sheet.tsx";
import type { Role } from "../features/admin/types.ts";
import { useSession } from "../features/users/api.ts";
import { ApiError } from "../lib/api.ts";
import { useTableState } from "../shared/lib/use-table-state.ts";
import type { Column } from "../shared/ui/data-table.tsx";
import { Badge, Button, Card, ConfirmDelete, EmptyState, IconButton } from "../shared/ui/primitives.tsx";
import { PageLoading } from "../shared/ui/table-states.tsx";
import { useToast } from "../shared/ui/toast.tsx";

const columns: Column<Role>[] = [
  {
    key: "name",
    header: "Peran",
    sortable: true,
    cell: (role) => (
      <span className="flex items-center gap-2">
        <span className="font-medium">{role.name}</span>
        {role.isSystem ? <Badge tone="accent">Sistem</Badge> : <Badge>Kustom</Badge>}
      </span>
    ),
  },
  {
    key: "key",
    header: "Kunci",
    sortable: true,
    cell: (role) => <span className="font-mono text-[12.5px] text-ink-soft">{role.key}</span>,
  },
  {
    key: "description",
    header: "Deskripsi",
    secondary: true,
    cell: (role) => <span className="text-ink-soft">{role.description || "—"}</span>,
  },
  {
    key: "isSystem",
    header: "Izin",
    sortable: true,
    align: "right",
    cell: (role) => <span className="text-ink-soft">{role.permissions.length}</span>,
  },
];

/** Role management: create, edit, delete, and set permissions — all of it writes to the server. */
export function RolesPage() {
  const session = useSession();
  const table = useTableState({ defaultSort: "key" });
  const roles = useRoleList(table.queryString, Boolean(session.data?.authenticated));
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const setPermissions = useSetRolePermissions();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [permRole, setPermRole] = useState<Role | null>(null);
  const toast = useToast();

  if (session.isPending) {
    return <PageLoading label="Menyiapkan…" />;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  const permissions = session.data.permissions;
  const canRead = permissions.includes("role.read");
  const canCreate = permissions.includes("role.create");
  const canUpdate = permissions.includes("role.update");
  const canDelete = permissions.includes("role.delete");
  const hasRowActions = canUpdate || canDelete;

  const save = (input: { key: string; name: string; description?: string }) => {
    if (editing) return updateRole.mutateAsync({ id: editing.id, name: input.name, description: input.description });
    return createRole.mutateAsync(input);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 lg:px-8">
      <Card>
        {!canRead ? (
          <EmptyState icon={ShieldCheck} message="Hanya pemilik yang dapat mengatur peran dan izin." />
        ) : (
          <ResourceTable
            caption="Daftar peran organisasi"
            columns={columns}
            rowKey={(role) => role.id}
            result={roles.data}
            state={table}
            pending={roles.isPending}
            error={roles.isError ? (roles.error as Error).message : undefined}
            searchPlaceholder="Cari peran…"
            empty={{ filtered: false, message: "Belum ada peran." }}
            headerExtra={
              canCreate ? (
                <Button
                  icon={ShieldPlus}
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Tambah
                </Button>
              ) : null
            }
            actions={
              hasRowActions
                ? (role) => (
                    <>
                      {canUpdate ? (
                        <IconButton
                          icon={KeyRound}
                          label={`Atur izin ${role.name}`}
                          onClick={() => setPermRole(role)}
                        />
                      ) : null}
                      {canUpdate ? (
                        <IconButton
                          icon={Pencil}
                          label={`Ubah ${role.name}`}
                          onClick={() => {
                            setEditing(role);
                            setFormOpen(true);
                          }}
                        />
                      ) : null}
                      {/* System roles come from code: deleting one only lets the seed revive it. */}
                      {canDelete && !role.isSystem ? (
                        <ConfirmDelete
                          label={role.name}
                          disabled={deleteRole.isPending}
                          onConfirm={() =>
                            deleteRole.mutate(role.id, {
                              onError: (err) =>
                                toast.error(
                                  err instanceof ApiError ? err.message : `Gagal menghapus peran ${role.name}`,
                                ),
                            })
                          }
                        />
                      ) : null}
                    </>
                  )
                : undefined
            }
          />
        )}
      </Card>

      <RoleSheet
        key={editing?.id ?? "baru"}
        open={formOpen}
        onOpenChange={setFormOpen}
        role={editing}
        onSubmit={save}
        pending={createRole.isPending || updateRole.isPending}
      />

      {permRole ? (
        <RolePermissionSheet
          key={permRole.id}
          open={Boolean(permRole)}
          onOpenChange={(open) => {
            if (!open) setPermRole(null);
          }}
          role={permRole}
          onSubmit={(perms) => setPermissions.mutateAsync({ id: permRole.id, permissions: perms })}
          pending={setPermissions.isPending}
        />
      ) : null}
    </div>
  );
}
