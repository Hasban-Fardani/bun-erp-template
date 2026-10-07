import { ResourceTable } from "@bun-erp/data-table/resource-table";
import type { Column } from "@bun-erp/data-table/server-table";
import { useI18n } from "@bun-erp/i18n/react";
import { Badge } from "@bun-erp/ui/atoms/badge.tsx";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Card } from "@bun-erp/ui/atoms/card.tsx";
import { IconButton } from "@bun-erp/ui/atoms/icon-button.tsx";
import { ConfirmDelete } from "@bun-erp/ui/molecules/confirm-delete.tsx";
import { EmptyState } from "@bun-erp/ui/molecules/empty-state.tsx";
import { PageLoading } from "@bun-erp/ui/molecules/table-states.tsx";
import { useToast } from "@bun-erp/ui/organisms/toast.tsx";
import { PageShell } from "@bun-erp/ui/templates/page-shell.tsx";
import { ApiError } from "@web/lib/api.ts";
import { useResourceTableLabels } from "@web/lib/resource-table-labels.ts";
import { useTableState } from "@web/lib/use-table-state.ts";
import { KeyRound, Pencil, ShieldCheck, ShieldPlus } from "lucide-react";
import { useState } from "react";
import { useSession } from "../../identity/hooks/index.ts";
import { RolePermissionSheet, RoleSheet } from "../components/role-sheet.tsx";
import { useCreateRole, useDeleteRole, useRoleList, useSetRolePermissions, useUpdateRole } from "../hooks/index.ts";
import type { Role } from "../types/index.ts";

/** Role management: create, edit, delete, and set permissions — all of it writes to the server. */
export function RolesScreen() {
  const { t } = useI18n();
  const labels = useResourceTableLabels();
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
  const columns: Column<Role>[] = [
    {
      key: "name",
      header: t("roles.column.role"),
      sortable: true,
      cell: (role) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{role.name}</span>
          {role.isSystem ? (
            <Badge tone="accent">{t("roles.badge.system")}</Badge>
          ) : (
            <Badge>{t("roles.badge.custom")}</Badge>
          )}
        </span>
      ),
    },
    {
      key: "key",
      header: t("roles.column.key"),
      sortable: true,
      cell: (role) => <span className="font-mono text-[12.5px] text-ink-soft">{role.key}</span>,
    },
    {
      key: "description",
      header: t("roles.column.description"),
      secondary: true,
      cell: (role) => <span className="text-ink-soft">{role.description || "—"}</span>,
    },
    {
      key: "isSystem",
      header: t("roles.column.permissions"),
      sortable: true,
      align: "right",
      cell: (role) => <span className="text-ink-soft">{role.permissions.length}</span>,
    },
  ];

  if (session.isPending) {
    return <PageLoading label={t("common.loading")} />;
  }
  if (!session.data?.authenticated) return null;

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
      <PageShell title={t("roles.title")}>
        <Card>
          {!canRead ? (
            <EmptyState icon={ShieldCheck} message={t("roles.permissionDenied")} />
          ) : (
            <ResourceTable
              caption={t("roles.caption")}
              columns={columns}
              rowKey={(role) => role.id}
              result={roles.data}
              state={table}
              pending={roles.isFetching}
              error={roles.isError ? (roles.error as Error).message : undefined}
              onRetry={() => void roles.refetch()}
              searchPlaceholder={t("roles.search")}
              empty={{ filtered: false, message: t("roles.empty"), noMatchMessage: t("roles.noMatch") }}
              labels={labels}
              headerExtra={
                canCreate ? (
                  <Button
                    icon={ShieldPlus}
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    {t("common.add")}
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
                            label={t("roles.configureNamed", { name: role.name })}
                            onClick={() => setPermRole(role)}
                          />
                        ) : null}
                        {canUpdate ? (
                          <IconButton
                            icon={Pencil}
                            label={t("roles.editNamed", { name: role.name })}
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
                            labels={{
                              delete: (name) => t("roles.deleteNamed", { name }),
                              confirm: (name) => t("roles.confirmDeleteNamed", { name }),
                              cancel: t("common.cancel"),
                            }}
                            disabled={deleteRole.isPending}
                            onConfirm={() =>
                              deleteRole.mutate(role.id, {
                                onSuccess: () => toast.success(t("roles.deleted")),
                                onError: (err) =>
                                  toast.error(
                                    err instanceof ApiError
                                      ? err.message
                                      : t("roles.deleteFailed", { name: role.name }),
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
      </PageShell>
    </div>
  );
}
