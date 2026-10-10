import { ResourceTable } from "@loom/data-table/resource-table";
import type { Column } from "@loom/data-table/server-table";
import { useI18n } from "@loom/i18n/react";
import { Badge } from "@loom/ui/atoms/badge.tsx";
import { Card } from "@loom/ui/atoms/card.tsx";
import { EmptyState } from "@loom/ui/molecules/empty-state.tsx";
import { PageLoading } from "@loom/ui/molecules/table-states.tsx";
import { PageShell } from "@loom/ui/templates/page-shell.tsx";
import { useResourceTableLabels } from "@web/lib/resource-table-labels.ts";
import { useTableState } from "@web/lib/use-table-state.ts";
import { useSession } from "../../identity/hooks/index.ts";
import { useDepartments } from "../hooks/index.ts";
import type { Department } from "../types/index.ts";

/** Reference list screen: departments, sorted and searchable. */
export function DepartmentsScreen() {
  const { t, formatRelativeTime } = useI18n();
  const labels = useResourceTableLabels();
  const session = useSession();
  const table = useTableState({ defaultSort: "name" });
  const departments = useDepartments(table.queryString);

  if (session.isPending) return <PageLoading label={t("common.loading")} />;
  if (!session.data?.authenticated) return null;

  const columns: Column<Department>[] = [
    {
      key: "name",
      header: t("departments.column.name"),
      sortable: true,
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "code",
      header: t("departments.column.code"),
      sortable: true,
      cell: (row) => <span className="font-mono text-[12.5px]">{row.code}</span>,
    },
    {
      key: "isActive",
      header: t("departments.column.status"),
      cell: (row) => (
        <Badge tone={row.isActive ? "accent" : "neutral"}>
          {row.isActive ? t("departments.status.active") : t("departments.status.inactive")}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: t("departments.column.created"),
      sortable: true,
      align: "right",
      cell: (row) => <time className="text-[12px] text-ink-muted">{formatRelativeTime(row.createdAt)}</time>,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <PageShell title={t("departments.title")}>
        <Card>
          {session.data.permissions.includes("department.read") ? (
            <ResourceTable
              caption={t("departments.caption")}
              columns={columns}
              rowKey={(row) => row.id}
              result={departments.data}
              state={table}
              pending={departments.isFetching}
              error={departments.isError ? (departments.error as Error).message : undefined}
              onRetry={() => void departments.refetch()}
              searchPlaceholder={t("departments.search")}
              empty={{ filtered: false, message: t("departments.empty"), noMatchMessage: t("departments.noMatch") }}
              labels={labels}
            />
          ) : (
            <EmptyState message={t("departments.permissionDenied")} />
          )}
        </Card>
      </PageShell>
    </div>
  );
}
