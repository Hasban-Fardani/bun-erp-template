import type { SpreadsheetCell } from "@loom/spreadsheet";

/** The server's import contract: parsed headers plus string rows, never the raw file. */
export type ParsedUpload = { headers: string[]; rows: string[][] };

/**
 * Parses an uploaded CSV or XLSX in the browser through `@loom/spreadsheet`. The heavy XLSX
 * engine is imported only when an .xlsx file is actually chosen, so the wizard's chunk stays small.
 */
export async function parseUpload(file: File): Promise<ParsedUpload> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readXlsx } = await import("@loom/spreadsheet/xlsx");
    const table = await readXlsx(await file.arrayBuffer());
    return {
      headers: table.columns.map((column) => column.header.trim()),
      rows: table.rows.map((row) => table.columns.map((column) => cellText(row[column.key] ?? null))),
    };
  }
  const { parseCsvStream } = await import("@loom/spreadsheet/csv");
  const table = await parseCsvStream(streamOf(file), name.endsWith(".tsv") ? { delimiter: "\t" } : {});
  return {
    headers: table.headers.map((header) => header.trim()),
    rows: table.rows.map((row) => row.map(cellText)),
  };
}

/** A web stream is not in the DOM lib's AsyncIterable types; this adapter keeps the contract exact. */
async function* streamOf(file: File): AsyncGenerator<Uint8Array> {
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function cellText(cell: SpreadsheetCell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell);
}
