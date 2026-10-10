import { ResourceTable } from "@loom/data-table/resource-table";
import type { Column } from "@loom/data-table/server-table";
import { useI18n } from "@loom/i18n/react";
import { Badge } from "@loom/ui/atoms/badge.tsx";
import { Button } from "@loom/ui/atoms/button.tsx";
import { Card } from "@loom/ui/atoms/card.tsx";
import { EmptyState } from "@loom/ui/molecules/empty-state.tsx";
import { PageLoading } from "@loom/ui/molecules/table-states.tsx";
import { PageShell } from "@loom/ui/templates/page-shell.tsx";
import { useResourceTableLabels } from "@web/lib/resource-table-labels.ts";
import { useTableState } from "@web/lib/use-table-state.ts";
import { ArrowDownUp, Download } from "lucide-react";
import { useState } from "react";
import { useSession } from "../../identity/hooks/index.ts";
import { ExportAction } from "../components/export-action.tsx";
import { ImportWizard } from "../components/import-wizard.tsx";
import { useImportExportResources, useImportHistory } from "../hooks/index.ts";
import type { ImportBatch } from "../types/index.ts";

const STATUS_TONE = {
  pending: "neutral",
  running: "accent",
  completed: "accent",
  failed: "neutral",
  cancelled: "neutral",
} as const;

const STATUS_KEY = {
  pending: "importExport.status.pending",
  running: "importExport.status.running",
  completed: "importExport.status.completed",
  failed: "importExport.status.failed",
  cancelled: "importExport.status.cancelled",
} as const;

/** Import/export workspace: the wizard, the batch history, and the export action on the table. */
export function ImportExportScreen() {
  const { t, formatRelativeTime } = useI18n();
  const labels = useResourceTableLabels();
  const session = useSession();
  const table = useTableState({ defaultSort: "createdAt", defaultDir: "desc" });
  const history = useImportHistory(table.queryString);
  const resources = useImportExportResources();
  const [exportOpen, setExportOpen] = useState(false);

  if (session.isPending) return <PageLoading label={t("common.loading")} />;
  if (!session.data?.authenticated) return null;

  const canRead = session.data.permissions.includes("import-export.read");
  const canImport = session.data.permissions.includes("import-export.create");
  const canExport = session.data.permissions.includes("import-export.read");

  const columns: Column<ImportBatch>[] = [
    {
      key: "resource",
      header: t("importExport.column.resource"),
      cell: (batch) => <span className="font-medium">{batch.label}</span>,
    },
    {
      key: "status",
      header: t("importExport.column.status"),
      cell: (batch) => <Badge tone={STATUS_TONE[batch.status]}>{t(STATUS_KEY[batch.status])}</Badge>,
    },
    {
      key: "rows",
      header: t("importExport.column.rows"),
      align: "right",
      cell: (batch) => (
        <span className="font-mono text-[12.5px]">
          {batch.processed}/{batch.total}
        </span>
      ),
    },
    {
      key: "failed",
      header: t("importExport.column.failed"),
      align: "right",
      secondary: true,
      cell: (batch) => <span className="font-mono text-[12.5px] text-ink-muted">{batch.failed}</span>,
    },
    {
      key: "createdAt",
      header: t("importExport.column.started"),
      align: "right",
      cell: (batch) => <time className="text-[12px] text-ink-muted">{formatRelativeTime(batch.createdAt)}</time>,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
      <PageShell title={t("importExport.title")}>
        <Card>
          {canImport ? (
            <ImportWizard resources={resources.data?.items ?? []} />
          ) : (
            <EmptyState icon={ArrowDownUp} message={t("importExport.permissionDenied")} />
          )}
        </Card>

        <Card>
          {canRead ? (
            <ResourceTable
              caption={t("importExport.caption")}
              columns={columns}
              rowKey={(batch) => batch.id}
              result={history.data}
              state={table}
              pending={history.isFetching}
              error={history.isError ? (history.error as Error).message : undefined}
              onRetry={() => void history.refetch()}
              searchPlaceholder={t("importExport.history.search")}
              empty={{
                filtered: false,
                message: t("importExport.history.empty"),
                noMatchMessage: t("importExport.history.noMatch"),
              }}
              labels={labels}
              headerExtra={
                canExport ? (
                  <Button variant="ghost" icon={Download} onClick={() => setExportOpen(true)}>
                    {t("importExport.export.title")}
                  </Button>
                ) : null
              }
            />
          ) : (
            <EmptyState message={t("importExport.permissionDenied")} />
          )}
        </Card>
      </PageShell>

      <ExportAction resources={resources.data?.items ?? []} open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}
