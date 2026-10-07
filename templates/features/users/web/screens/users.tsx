import { ResourceTable } from "@bun-erp/data-table/resource-table";
import type { Column } from "@bun-erp/data-table/server-table";
import { useI18n } from "@bun-erp/i18n/react";
import { Badge } from "@bun-erp/ui/atoms/badge.tsx";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Card } from "@bun-erp/ui/atoms/card.tsx";
import { IconButton } from "@bun-erp/ui/atoms/icon-button.tsx";
import { ConfirmDelete } from "@bun-erp/ui/molecules/confirm-delete.tsx";
import { PageLoading } from "@bun-erp/ui/molecules/table-states.tsx";
import { useToast } from "@bun-erp/ui/organisms/toast.tsx";
import { PageShell } from "@bun-erp/ui/templates/page-shell.tsx";
import { ApiError } from "@web/lib/api.ts";
import { useResourceTableLabels } from "@web/lib/resource-table-labels.ts";
import { useTableState } from "@web/lib/use-table-state.ts";
import { Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { useSession } from "../../identity/hooks/index.ts";
import { UserSheet } from "../components/user-sheet.tsx";
import { useDeleteUser, useUpdateUser, useUsers } from "../hooks/index.ts";
import type { PublicUser } from "../types/index.ts";

/** Administration screen for organisation members: list, add, edit, delete. */
export function UsersScreen() {
  const { t, formatRelativeTime } = useI18n();
  const labels = useResourceTableLabels();
  const session = useSession();
  const table = useTableState({ defaultSort: "name", searchDelay: 300 });
  const users = useUsers(table.queryString);
  const deleteUser = useDeleteUser();
  const updateUser = useUpdateUser();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const toast = useToast();
  const columns: Column<PublicUser>[] = [
    {
      key: "name",
      header: t("users.column.name"),
      sortable: true,
      cell: (u) => <span className="font-medium">{u.name}</span>,
    },
    {
      key: "email",
      header: t("common.email"),
      sortable: true,
      cell: (u) => <span className="text-ink-soft">{u.email}</span>,
    },
    {
      key: "roles",
      header: t("users.column.roles"),
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
      header: t("users.column.verification"),
      secondary: true,
      cell: (u) =>
        u.emailVerified ? (
          <span className="text-accent">{t("users.verified")}</span>
        ) : (
          <span className="text-ink-muted">{t("users.notVerified")}</span>
        ),
    },
    {
      key: "createdAt",
      header: t("users.column.created"),
      sortable: true,
      secondary: true,
      align: "right",
      cell: (u) => formatRelativeTime(u.createdAt),
    },
  ];

  if (session.isPending) return <Loading />;
  if (!session.data?.authenticated) return null;

  const permissions = session.data.permissions;
  const canRead = permissions.includes("user.read");
  const canWrite = permissions.includes("user.update");
  const canCreate = permissions.includes("user.create");
  const canDelete = permissions.includes("user.delete");

  if (!canRead) {
    return (
      <Shell>
        <PageShell title={t("users.title")}>
          <p className="px-4 py-10 text-center text-[13px] text-ink-muted">{t("users.permissionDenied")}</p>
        </PageShell>
      </Shell>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <Shell>
      <PageShell title={t("users.title")}>
        <Card>
          <ResourceTable
            caption={t("users.caption")}
            columns={columns}
            rowKey={(u) => u.id}
            result={users.data}
            state={table}
            pending={users.isFetching}
            error={users.isError ? (users.error as Error).message : undefined}
            onRetry={() => void users.refetch()}
            searchPlaceholder={t("users.search")}
            empty={{ filtered: false, message: t("users.empty"), noMatchMessage: t("users.noMatch") }}
            labels={labels}
            headerExtra={
              canCreate ? (
                <Button data-testid="resource-table-primary-action" icon={UserPlus} onClick={openCreate}>
                  {t("common.add")}
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
                          label={t("users.editNamed", { name: u.name })}
                          onClick={() => {
                            setEditing(u);
                            setFormOpen(true);
                          }}
                        />
                      ) : null}
                      {canDelete ? (
                        <ConfirmDelete
                          label={u.email}
                          labels={{
                            delete: (label) => t("users.deleteNamed", { name: label }),
                            confirm: (label) => t("users.confirmDeleteNamed", { name: label }),
                            cancel: t("common.cancel"),
                          }}
                          disabled={deleteUser.isPending}
                          onConfirm={() =>
                            deleteUser.mutate(u.id, {
                              onSuccess: () => toast.success(t("users.deleted")),
                              onError: (err) =>
                                toast.error(err instanceof ApiError ? err.message : t("users.deleteFailed")),
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
          canAssignRole={permissions.includes("role.assign")}
          onSave={(input) => {
            if (!editing) return;
            updateUser.mutate(
              {
                id: editing.id,
                name: input.name,
                roleKey: permissions.includes("role.assign") ? input.roleKey : undefined,
              },
              {
                onSuccess: () => setFormOpen(false),
                onError: (err) => toast.error(err instanceof ApiError ? err.message : t("users.saveFailed")),
              },
            );
          }}
          saving={updateUser.isPending}
        />
      </PageShell>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 lg:px-8">{children}</div>;
}

function Loading() {
  const { t } = useI18n();
  return <PageLoading label={t("common.loading")} />;
}
