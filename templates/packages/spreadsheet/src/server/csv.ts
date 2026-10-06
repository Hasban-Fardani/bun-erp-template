import Papa from "papaparse";
import type { CsvCell, CsvTable } from "../utils/types.ts";

/**
 * CSV through Papa Parse. Excel in an Indonesian locale writes `;` as the delimiter, so parsing
 * auto-detects instead of assuming `,`; a UTF-8 BOM is stripped because spreadsheet exports add it.
 */

export type CsvParseOptions = {
  /** Leave unset to auto-detect `,`, `;` or a tab from the header line. */
  delimiter?: string;
  /** Default: drop rows that are entirely empty. */
  skipEmptyLines?: boolean;
  /** Default: strip a leading UTF-8 BOM. */
  stripBom?: boolean;
};

export type CsvWriteOptions = {
  delimiter?: string;
  /** Default `\r\n`, which every spreadsheet application reads. */
  newline?: string;
  /** Prepend a UTF-8 BOM so Excel detects the encoding. */
  includeBom?: boolean;
  /** Quote every cell instead of only the ones that need it. */
  quoteAll?: boolean;
};

const BOM = "\uFEFF";

export function parseCsv(text: string, options: CsvParseOptions = {}): CsvTable {
  const input = options.stripBom === false ? text : stripBom(text);
  const result = Papa.parse<string[]>(input, {
    delimiter: options.delimiter ?? "",
    skipEmptyLines: options.skipEmptyLines === false ? false : "greedy",
    dynamicTyping: false,
  });
  // A single-column file has no delimiter to detect; Papa reports that guess as an error but the
  // default `,` still parses it correctly, so only real parse failures should surface.
  const failure = result.errors.find((error) => error.type !== "Delimiter");
  if (failure) {
    throw new Error(`CSV_PARSE_FAILED: ${failure.message} at row ${(failure.row ?? 0) + 1}`);
  }
  return toCsvTable(result.data);
}

/**
 * Parses a chunked source (a file stream, an async generator) without ever holding the raw text in
 * one string; row order and quoted fields survive chunk boundaries because Papa drives the stream.
 * Papa owns its duplex parser, so this module needs no Node stream import of its own.
 */
export function parseCsvStream(
  source: AsyncIterable<string | Uint8Array>,
  options: CsvParseOptions = {},
): Promise<CsvTable> {
  return new Promise((resolve, reject) => {
    const rows: string[][] = [];
    let first = true;
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      delimiter: options.delimiter ?? "",
      skipEmptyLines: options.skipEmptyLines === false ? false : "greedy",
      dynamicTyping: false,
    });
    parser.on("data", (cells: string[]) => {
      if (first) {
        first = false;
        if (options.stripBom !== false && typeof cells[0] === "string") cells[0] = stripBom(cells[0]);
      }
      rows.push(cells);
    });
    parser.on("end", () => {
      const [headerRow = [], ...dataRows] = rows;
      resolve({ headers: headerRow, rows: dataRows });
    });
    parser.on("error", (error: Error) => reject(new Error(`CSV_PARSE_FAILED: ${error.message}`)));

    void (async () => {
      try {
        for await (const chunk of decodeChunks(source)) parser.write(chunk);
        parser.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error("CSV_PARSE_FAILED"));
      }
    })();
  });
}

export function stringifyCsv(table: CsvTable, options: CsvWriteOptions = {}): string {
  const matrix = [table.headers, ...table.rows].map((row) => row.map(formatCell));
  const body = Papa.unparse(matrix, {
    delimiter: options.delimiter ?? ",",
    newline: options.newline ?? "\r\n",
    quotes: options.quoteAll === true,
  });
  return options.includeBom ? `${BOM}${body}` : body;
}

function toCsvTable(rows: string[][]): CsvTable {
  const [headerRow = [], ...dataRows] = rows;
  return { headers: headerRow, rows: dataRows };
}

/** Decodes byte chunks with one decoder so a multi-byte character split across chunks survives. */
async function* decodeChunks(source: AsyncIterable<string | Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  for await (const chunk of source) {
    if (typeof chunk === "string") {
      yield chunk;
      continue;
    }
    const text = decoder.decode(chunk, { stream: true });
    if (text) yield text;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

function formatCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell);
}

function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}
