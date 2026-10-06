import ExcelJS from "exceljs";
import type { SpreadsheetCell, SpreadsheetColumn, SpreadsheetTable } from "../utils/types.ts";

/**
 * XLSX through ExcelJS (ADR-0005). Styled headers, column widths and number formats are part of
 * the write path; the reader normalizes rich text, formulas and hyperlinks to plain cell values.
 */

export type XlsxWriteOptions = {
  sheetName?: string;
  /** ARGB fill for the header row, e.g. `FFE8EDF5`. */
  headerFill?: string;
  /** Header text color as ARGB. */
  headerColor?: string;
};

export type XlsxReadOptions = {
  /** Worksheet name or zero-based index; defaults to the first sheet. */
  sheet?: string | number;
};

const DEFAULT_HEADER_FILL = "FFE8EDF5";

export async function writeXlsx(
  table: SpreadsheetTable,
  options: XlsxWriteOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(table.sheetName ?? options.sheetName ?? "Sheet1");
  sheet.columns = table.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? Math.max(12, column.header.length + 2),
    ...(column.numFmt ? { style: { numFmt: column.numFmt } } : {}),
  }));
  for (const row of table.rows) {
    sheet.addRow(row as Record<string, SpreadsheetCell>);
  }
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: options.headerColor ?? "FF1F2933" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.headerFill ?? DEFAULT_HEADER_FILL } };
  header.commit();
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function readXlsx(
  data: ArrayBuffer | Uint8Array,
  options: XlsxReadOptions = {},
): Promise<SpreadsheetTable> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toArrayBuffer(data) as unknown as ExcelJS.Buffer);
  const sheet = findSheet(workbook, options.sheet);
  return readSheet(sheet);
}

/** Reads a large workbook without materializing the whole file: ExcelJS streams entries on demand. */
export async function readXlsxStream(path: string, options: XlsxReadOptions = {}): Promise<SpreadsheetTable> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "cache",
  });
  let index = 0;
  for await (const worksheet of reader) {
    // The streaming reader's types omit `name`; the requested name is what callers can rely on.
    const selected = typeof options.sheet === "number" ? index === options.sheet : index === 0;
    if (selected)
      return await readStreamSheet(worksheet, typeof options.sheet === "string" ? options.sheet : undefined);
    index += 1;
  }
  throw new Error(`XLSX_SHEET_NOT_FOUND: ${describeSheet(options.sheet)}`);
}

function findSheet(workbook: ExcelJS.Workbook, sheet: XlsxReadOptions["sheet"]): ExcelJS.Worksheet {
  const found =
    typeof sheet === "number"
      ? workbook.worksheets[sheet]
      : typeof sheet === "string"
        ? workbook.getWorksheet(sheet)
        : workbook.worksheets[0];
  if (!found) throw new Error(`XLSX_SHEET_NOT_FOUND: ${describeSheet(sheet)}`);
  return found;
}

function readSheet(sheet: ExcelJS.Worksheet): SpreadsheetTable {
  const headers = headerValues(sheet.getRow(1));
  const rows: Record<string, SpreadsheetCell>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows.push(toRecord(headers, rowValues(row)));
  });
  return { sheetName: sheet.name, columns: toColumns(headers), rows };
}

async function readStreamSheet(
  sheet: ExcelJS.stream.xlsx.WorksheetReader,
  sheetName: string | undefined,
): Promise<SpreadsheetTable> {
  const rows: Record<string, SpreadsheetCell>[] = [];
  let headers: string[] = [];
  let first = true;
  for await (const row of sheet) {
    if (first) {
      headers = headerValues(row);
      first = false;
      continue;
    }
    rows.push(toRecord(headers, rowValues(row)));
  }
  return { ...(sheetName ? { sheetName } : {}), columns: toColumns(headers), rows };
}

/** ExcelJS row.values is a 1-based sparse array; index 0 is unused. */
function rowValues(row: ExcelJS.Row): SpreadsheetCell[] {
  const values = Array.isArray(row.values) ? row.values.slice(1) : [];
  return values.map((value) => normalizeCell(value as ExcelJS.CellValue));
}

function headerValues(row: ExcelJS.Row): string[] {
  return rowValues(row).map((cell) => {
    if (cell === null) return "";
    if (cell instanceof Date) return cell.toISOString();
    return String(cell);
  });
}

function toRecord(headers: readonly string[], cells: readonly SpreadsheetCell[]): Record<string, SpreadsheetCell> {
  const record: Record<string, SpreadsheetCell> = {};
  headers.forEach((header, index) => {
    if (header.length === 0) return;
    record[header] = cells[index] ?? null;
  });
  return record;
}

function toColumns(headers: readonly string[]): SpreadsheetColumn[] {
  return headers
    .filter((header) => header.length > 0)
    .map((header) => ({ key: header, header, width: Math.max(12, header.length + 2) }));
}

/** Rich text, formula results and hyperlinks all collapse to the value a spreadsheet user sees. */
function normalizeCell(value: ExcelJS.CellValue | undefined): SpreadsheetCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("result" in value) return normalizeCell(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return null;
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof Uint8Array) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  return data;
}

function describeSheet(sheet: XlsxReadOptions["sheet"]): string {
  if (sheet === undefined) return "first sheet";
  return typeof sheet === "number" ? `index ${sheet}` : `name "${sheet}"`;
}
