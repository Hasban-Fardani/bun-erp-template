import { useI18n } from "@loom/i18n/react";
import { Badge } from "@loom/ui/atoms/badge.tsx";
import { Button } from "@loom/ui/atoms/button.tsx";
import { Input } from "@loom/ui/atoms/input.tsx";
import { Progress } from "@loom/ui/atoms/progress.tsx";
import { SimpleSelect } from "@loom/ui/molecules/select.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@loom/ui/molecules/table.tsx";
import { useToast } from "@loom/ui/organisms/toast.tsx";
import { CheckCircle2, FileUp, Play, RotateCcw, Square } from "lucide-react";
import { useState } from "react";
import {
  useCancelImport,
  useImportDryRun,
  useImportProgress,
  useResumeImport,
  useStartImport,
} from "../hooks/index.ts";
import { type ParsedUpload, parseUpload } from "../lib/parse-file.ts";
import type { ImportDryRunReport, ImportExportResource, ImportProgress } from "../types/index.ts";

/**
 * The wizard: choose a resource and a file, check it (dry run), confirm, then watch the batch.
 * Confirm re-uploads the same file because the server re-validates on its own; a client is never
 * trusted with the row set.
 */
export function ImportWizard({ resources }: { resources: readonly ImportExportResource[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [resource, setResource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ParsedUpload | null>(null);
  const [report, setReport] = useState<ImportDryRunReport | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const dryRun = useImportDryRun();
  const start = useStartImport();
  const cancel = useCancelImport();
  const resume = useResumeImport();
  const progress = useImportProgress(batchId);

  const options = resources
    .filter((entry) => entry.canImport)
    .map((entry) => ({ value: entry.name, label: entry.label }));

  const check = async () => {
    if (!file) return toast.error(t("importExport.import.needFile"));
    if (!resource) return toast.error(t("importExport.import.needResource"));
    try {
      const parsed = await parseUpload(file);
      setSource(parsed);
      setReport(await dryRun.mutateAsync({ resource, headers: parsed.headers, rows: parsed.rows }));
    } catch {
      toast.error(t("importExport.import.checkFailed"));
    }
  };

  const confirm = async () => {
    if (!source || !resource) return;
    try {
      const started = await start.mutateAsync({ resource, headers: source.headers, rows: source.rows });
      setBatchId(started.batchId);
      setReport(started.report);
      toast.success(t("importExport.import.starting"));
    } catch {
      toast.error(t("importExport.import.startFailed"));
    }
  };

  const stop = async () => {
    if (!batchId) return;
    try {
      await cancel.mutateAsync(batchId);
      toast.success(t("importExport.import.cancelled"));
    } catch {
      toast.error(t("importExport.import.cancelFailed"));
    }
  };

  const continueImport = async () => {
    if (!batchId) return;
    try {
      await resume.mutateAsync(batchId);
      toast.success(t("importExport.import.resumed"));
    } catch {
      toast.error(t("importExport.import.resumeFailed"));
    }
  };

  const current = progress.data;
  const running = current?.status === "pending" || current?.status === "running";

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-[13px] text-ink-muted">{t("importExport.import.description")}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-soft">{t("importExport.import.resource")}</span>
          <SimpleSelect
            value={resource}
            onValueChange={setResource}
            options={options}
            placeholder={t("importExport.import.resourcePlaceholder")}
            label={t("importExport.import.resource")}
            disabled={running}
            testId="import-resource"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-soft">{t("importExport.import.file")}</span>
          <Input
            type="file"
            accept=".csv,.xlsx,text/csv"
            disabled={running}
            aria-label={t("importExport.import.file")}
            data-testid="import-file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setSource(null);
              setReport(null);
              setBatchId(null);
            }}
          />
          <span className="text-[11px] text-ink-muted">{t("importExport.import.fileHint")}</span>
        </div>
      </div>

      {!batchId ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={FileUp} disabled={dryRun.isPending} onClick={() => void check()}>
            {dryRun.isPending ? t("importExport.import.checking") : t("importExport.import.check")}
          </Button>
          {report && report.valid > 0 && source ? (
            <Button variant="primary" icon={Play} disabled={start.isPending} onClick={() => void confirm()}>
              {start.isPending ? t("importExport.import.starting") : t("importExport.import.confirm")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {report ? <ReportCard report={report} /> : null}
      {current ? (
        <ProgressCard
          progress={current}
          onCancel={() => void stop()}
          onResume={() => void continueImport()}
          cancelPending={cancel.isPending}
          resumePending={resume.isPending}
        />
      ) : null}
    </div>
  );
}

function ReportCard({ report }: { report: ImportDryRunReport }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="import-report">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-ink-soft">{t("importExport.import.result")}</span>
        <Badge tone="accent">{t("importExport.import.validCount", { count: report.valid })}</Badge>
        {report.invalid > 0 ? <Badge>{t("importExport.import.invalidCount", { count: report.invalid })}</Badge> : null}
      </div>
      {report.errors.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("importExport.import.row")}</TableHead>
                <TableHead>{t("importExport.import.column")}</TableHead>
                <TableHead>{t("importExport.import.problem")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.errors.map((error, index) => (
                <TableRow key={`${error.row}-${error.column ?? "row"}-${index}`}>
                  <TableCell className="font-mono text-[12px]">{error.row}</TableCell>
                  <TableCell className="font-mono text-[12px]">{error.column ?? "—"}</TableCell>
                  <TableCell className="text-[12.5px]">{error.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {report.truncated ? (
        <p className="text-[11.5px] text-ink-muted">
          {t("importExport.import.truncated", { count: report.errors.length })}
        </p>
      ) : null}
    </div>
  );
}

function ProgressCard({
  progress,
  onCancel,
  onResume,
  cancelPending,
  resumePending,
}: {
  progress: ImportProgress;
  onCancel: () => void;
  onResume: () => void;
  cancelPending: boolean;
  resumePending: boolean;
}) {
  const { t } = useI18n();
  const running = progress.status === "pending" || progress.status === "running";
  const percent = progress.total === 0 ? 0 : Math.round((progress.processed / progress.total) * 100);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="import-progress">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-ink-soft">
          {t("importExport.import.processed", { processed: progress.processed, total: progress.total })}
        </span>
        {progress.failed > 0 ? <Badge>{t("importExport.import.failedCount", { count: progress.failed })}</Badge> : null}
        {progress.status === "completed" ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-soft">
            <CheckCircle2 size={14} aria-hidden="true" />
            {t("importExport.import.done")}
          </span>
        ) : null}
      </div>
      <Progress value={percent} aria-label={t("importExport.import.title")} />
      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button variant="danger" icon={Square} disabled={cancelPending} onClick={onCancel}>
            {t("importExport.import.cancel")}
          </Button>
        ) : null}
        {progress.status === "cancelled" || progress.status === "failed" ? (
          <Button variant="ghost" icon={RotateCcw} disabled={resumePending} onClick={onResume}>
            {t("importExport.import.resume")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
