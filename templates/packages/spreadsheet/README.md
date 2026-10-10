# `@loom/spreadsheet`

CSV and XLSX read/write behind one dependency boundary. Features build a shared row/column model
and never import `papaparse` or `exceljs` themselves, so a future format change touches this
package only. ExcelJS is the XLSX engine per ADR-0005.

```ts
import { parseCsv, stringifyCsv, readXlsx, writeXlsx, type SpreadsheetTable } from "@loom/spreadsheet";

const table: SpreadsheetTable = {
  sheetName: "Departemen",
  columns: [
    { key: "name", header: "Nama", width: 24 },
    { key: "createdAt", header: "Dibuat", numFmt: "yyyy-mm-dd" },
  ],
  rows: [{ name: "Keuangan", createdAt: new Date() }],
};

const bytes = await writeXlsx(table);       // Uint8Array
const parsed = await readXlsx(bytes);       // rows are keyed by header
const csv = stringifyCsv({ headers: ["name"], rows: [["Keuangan"]] });
const fromCsv = parseCsv(csv);
```

## Behavior

- CSV parsing auto-detects the delimiter (`,`, `;`, tab), strips a UTF-8 BOM, keeps quoted fields
  and embedded newlines, and skips fully empty rows. `parseCsvStream` reads a chunked source
  (file stream or async generator) without holding the raw text in one string.
- `stringifyCsv` writes `\r\n` by default and can prepend a BOM for Excel.
- XLSX writing applies bold filled headers, column widths and per-column number formats; dates stay
  dates. Reading normalizes rich text, formula results and hyperlinks to plain values.
  `readXlsxStream` reads a large workbook from disk through ExcelJS's streaming reader.
- Rows read back from XLSX are keyed by their header, because a workbook carries no knowledge of
  the writer's column keys.

## Exports

- `@loom/spreadsheet`: shared types plus the CSV and XLSX functions.
- `@loom/spreadsheet/csv`: `parseCsv`, `parseCsvStream`, `stringifyCsv` and their options.
- `@loom/spreadsheet/xlsx`: `readXlsx`, `readXlsxStream`, `writeXlsx` and their options.
- `@loom/spreadsheet/llms.txt`: concise model-oriented package map.

## Limits

- CSV parsing is memory-bound unless the caller consumes `parseCsvStream`; the returned table holds
  every row.
- XLSX streaming reads from a file path; in-memory `readXlsx` needs the whole workbook buffered.
- SheetJS stays rejected (ADR-0005); do not add a second XLSX engine.
