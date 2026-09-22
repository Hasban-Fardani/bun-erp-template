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
import { RolePermissionSheet, RoleSheet } from "../features/admin/role-sheet.tsx";
import type { Role } from "../features/admin/types.ts";
import { useSession } from "../features/users/api.ts";
import { ApiError } from "../lib/api.ts";
import { Badge, Button, Card, CardHeader, ConfirmDelete, EmptyState, IconButton } from "../shared/ui/primitives.tsx";

/** Role management: create, edit, delete, and set permissions — all of it writes to the server. */
export function RolesPage() {
  const session = useSession();
  const roles = useRoleList(Boolean(session.data?.authenticated));
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const setPermissions = useSetRolePermissions();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [permRole, setPermRole] = useState<Role | null>(null);
  const [notice, setNotice] = useState("");

  if (session.isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-ink-muted">Memuat…</div>;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  const permissions = session.data.permissions;
  const canRead = permissions.includes("role.read");
  const canCreate = permissions.includes("role.create");
  const canUpdate = permissions.includes("role.update");
  const canDelete = permissions.includes("role.delete");
  const hasRowActions = canUpdate || canDelete;

  const save = (input: { key: string; name: string; description?: string }) => {
    setNotice("");
    if (editing) return updateRole.mutateAsync({ id: editing.id, name: input.name, description: input.description });
    return createRole.mutateAsync(input);
  };

  const remove = (id: string, name: string) => {
    setNotice("");
    deleteRole.mutate(id, {
      onError: (err) => setNotice(err instanceof ApiError ? err.message : `Gagal menghapus peran ${name}`),
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <Card>
        <CardHeader
          title="Peran & Izin"
          description={
            canRead
              ? `${roles.data?.length ?? 0} peran; role sistem dikunci dari penghapusan`
              : "Izin baca tidak dimiliki"
          }
          action={
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
        />

        {notice ? (
          <p role="alert" className="border-b border-danger/20 bg-danger-soft px-4 py-2 text-[12.5px] text-danger">
            {notice}
          </p>
        ) : null}

        {!canRead ? (
          <EmptyState icon={ShieldCheck} message="Peran Anda tidak memiliki izin role.read." />
        ) : roles.isPending ? (
          <EmptyState message="Memuat peran…" />
        ) : roles.isError ? (
          <EmptyState message={`Gagal memuat: ${(roles.error as Error).message}`} />
        ) : roles.data.length === 0 ? (
          <EmptyState icon={ShieldCheck} message="Belum ada peran." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] font-medium text-ink-muted">
                  <th className="px-4 py-2.5">Peran</th>
                  <th className="px-4 py-2.5">Kunci</th>
                  <th className="px-4 py-2.5">Deskripsi</th>
                  <th className="px-4 py-2.5 text-right">Izin</th>
                  {hasRowActions ? <th className="px-4 py-2.5 text-right">Aksi</th> : null}
                </tr>
              </thead>
              <tbody>
                {roles.data.map((role) => (
                  <tr key={role.id} className="border-b border-border/50 last:border-0 hover:bg-background/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.isSystem ? <Badge tone="accent">Sistem</Badge> : <Badge>Kustom</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12.5px] text-ink-soft">{role.key}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{role.description || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-ink-soft">{role.permissions.length}</td>
                    {hasRowActions ? (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
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
                              onConfirm={() => remove(role.id, role.name)}
                            />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
