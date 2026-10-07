import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Checkbox } from "@bun-erp/ui/atoms/checkbox.tsx";
import { SimpleSelect } from "@bun-erp/ui/molecules/select.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bun-erp/ui/organisms/dialog.tsx";
import { useToast } from "@bun-erp/ui/organisms/toast.tsx";
import { call, rpc } from "@web/lib/rpc.ts";
import { Download } from "lucide-react";
import { useState } from "react";
import type { ExportData, ImportExportFormat, ImportExportResource } from "../types/index.ts";

/**
 * Export dialog for the history table's header action. The server returns the rows through the
 * resource's list contract; the browser writes the file so the format engines stay in the web
 * bundle, behind `@bun-erp/spreadsheet`.
 */
export function ExportAction({
  resources,
  open,
  onOpenChange,
}: {
  resources: readonly ImportExportResource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const exportable = resources.filter((entry) => entry.canExport);
  const [resource, setResource] = useState("");
  const [format, setFormat] = useState<ImportExportFormat>("csv");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const columns = exportable.find((entry) => entry.name === resource)?.columns ?? [];

  const download = async () => {
    if (!resource) return toast.error(t("importExport.import.needResource"));
    setPending(true);
    try {
      const data = await call(
        rpc["import-export"].exports[":resource"].$get({
          param: { resource },
          query: { ...(selected.length > 0 ? { columns: selected.join(",") } : {}) },
        }),
      );
      saveBlob(await buildFile(data, format), `${data.resource}-${new Date().toISOString().slice(0, 10)}.${format}`);
      onOpenChange(false);
    } catch {
      toast.error(t("importExport.export.failed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("importExport.export.title")}</DialogTitle>
          <DialogDescription>{t("importExport.export.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-soft">{t("importExport.export.resource")}</span>
            <SimpleSelect
              value={resource}
              onValueChange={(value) => {
                setResource(value);
                setSelected([]);
              }}
              options={exportable.map((entry) => ({ value: entry.name, label: entry.label }))}
              placeholder={t("importExport.import.resourcePlaceholder")}
              label={t("importExport.export.resource")}
              testId="export-resource"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-soft">{t("importExport.export.format")}</span>
            <SimpleSelect
              value={format}
              onValueChange={(value) => setFormat(value === "xlsx" ? "xlsx" : "csv")}
              options={[
                { value: "csv", label: t("importExport.export.csv") },
                { value: "xlsx", label: t("importExport.export.xlsx") },
              ]}
              label={t("importExport.export.format")}
              testId="export-format"
            />
          </div>
          {columns.length > 0 ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-[12px] font-medium text-ink-soft">{t("importExport.export.columns")}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {columns.map((column) => (
                  <div key={column.key} className="flex items-center gap-2 text-[12.5px]">
                    <Checkbox
                      aria-label={column.header}
                      checked={selected.includes(column.key)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked === true ? [...current, column.key] : current.filter((key) => key !== column.key),
                        )
                      }
                    />
                    <span>{column.header}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-ink-muted">
                {selected.length === 0
                  ? t("importExport.export.allColumns")
                  : t("importExport.import.validCount", { count: selected.length })}
              </p>
            </fieldset>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="primary" icon={Download} disabled={pending || !resource} onClick={() => void download()}>
            {pending ? t("importExport.export.downloading") : t("importExport.export.download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function buildFile(data: ExportData, format: ImportExportFormat): Promise<Blob> {
  if (format === "csv") {
    const { stringifyCsv } = await import("@bun-erp/spreadsheet/csv");
    const text = stringifyCsv(
      { headers: data.columns.map((column) => column.header), rows: data.rows },
      { includeBom: true },
    );
    return new Blob([text], { type: "text/csv;charset=utf-8" });
  }
  const { writeXlsx } = await import("@bun-erp/spreadsheet/xlsx");
  const bytes = await writeXlsx({
    sheetName: data.label.slice(0, 31),
    columns: data.columns.map((column) => ({
      key: column.key,
      header: column.header,
      width: column.width ?? Math.max(12, column.header.length + 2),
      ...(column.numFmt ? { numFmt: column.numFmt } : {}),
    })),
    rows: data.rows.map((row) =>
      Object.fromEntries(
        data.columns.map((column, index) => [column.key, xlsxCell(row[index] ?? null, column.numFmt)]),
      ),
    ),
  });
  return new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** JSON turns dates into ISO strings; a date-formatted column turns them back for Excel. */
function xlsxCell(value: ExportData["rows"][number][number], numFmt: string | undefined) {
  if (typeof value === "string" && numFmt && /[yd]/i.test(numFmt)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return value;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
