/**
 * Shared row and column shapes for every tabular format. Features build these and never import
 * papaparse or exceljs; a cell stays a plain value so it can be validated before it is written.
 */

export type SpreadsheetCell = string | number | boolean | Date | null;

export type SpreadsheetColumn = {
  key: string;
  header: string;
  /** Excel column width in characters; defaults to the header length plus padding. */
  width?: number;
  /** Excel number format, e.g. `yyyy-mm-dd` for dates or `#,##0` for numbers. */
  numFmt?: string;
};

export type SpreadsheetRow = Readonly<Record<string, SpreadsheetCell>>;

export type SpreadsheetTable = {
  sheetName?: string;
  columns: readonly SpreadsheetColumn[];
  rows: readonly SpreadsheetRow[];
};

/** A parsed CSV stays a string matrix until a caller maps headers to its own columns. */
export type CsvCell = string | number | boolean | Date | null;

export type CsvTable = {
  headers: readonly string[];
  rows: readonly (readonly CsvCell[])[];
};
