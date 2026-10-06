import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { readXlsx, readXlsxStream, writeXlsx } from "../src/server/xlsx.ts";

const table = {
  sheetName: "Departemen",
  columns: [
    { key: "name", header: "Nama", width: 24 },
    { key: "code", header: "Kode", width: 10 },
    { key: "count", header: "Jumlah", numFmt: "#,##0" },
    { key: "createdAt", header: "Dibuat", numFmt: "yyyy-mm-dd" },
  ],
  rows: [
    { name: "Keuangan", code: "KEU", count: 1200, createdAt: new Date("2026-03-04T00:00:00.000Z") },
    { name: "Operasi", code: "OPS", count: 7, createdAt: new Date("2026-03-05T00:00:00.000Z") },
  ],
};

describe("xlsx", () => {
  test("round-trips values and keeps dates as dates", async () => {
    const bytes = await writeXlsx(table);
    const parsed = await readXlsx(bytes);
    expect(parsed.sheetName).toBe("Departemen");
    expect(parsed.columns.map((column) => column.header)).toEqual(["Nama", "Kode", "Jumlah", "Dibuat"]);
    // The reader keys rows by header, because a workbook carries no knowledge of the writer's keys.
    expect(parsed.rows[0]?.Nama).toBe("Keuangan");
    expect(parsed.rows[0]?.Jumlah).toBe(1200);
    const created = parsed.rows[0]?.Dibuat;
    if (!(created instanceof Date)) throw new Error("expected the date column to stay a Date");
    expect(created.toISOString()).toBe("2026-03-04T00:00:00.000Z");
  });

  test("writes styled headers, column widths and number formats", async () => {
    const bytes = await writeXlsx(table);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("Departemen");
    expect(sheet).toBeTruthy();
    const header = sheet?.getRow(1);
    expect(header?.getCell(1).font?.bold).toBe(true);
    const fill = header?.getCell(1).fill;
    const headerFill = fill && "fgColor" in fill ? fill.fgColor?.argb : undefined;
    expect(headerFill).toBe("FFE8EDF5");
    expect(sheet?.getColumn(1).width).toBe(24);
    expect(sheet?.getColumn(4).numFmt).toBe("yyyy-mm-dd");
    const dateCell = sheet?.getRow(2).getCell(4);
    expect(dateCell?.numFmt).toBe("yyyy-mm-dd");
    expect(dateCell?.value).toBeInstanceOf(Date);
  });

  test("streams a large workbook from disk", async () => {
    const path = `.data/spreadsheet-stream-${crypto.randomUUID()}.xlsx`;
    const rows = Array.from({ length: 250 }, (_, index) => ({
      name: `Baris ${index + 1}`,
      code: `K-${String(index + 1).padStart(4, "0")}`,
      count: index + 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }));
    try {
      await Bun.write(path, await writeXlsx({ ...table, rows }));
      const parsed = await readXlsxStream(path);
      expect(parsed.rows).toHaveLength(250);
      expect(parsed.rows[0]?.Kode).toBe("K-0001");
      expect(parsed.rows[249]?.Jumlah).toBe(250);
    } finally {
      await Bun.file(path).delete();
    }
  });

  test("reads a named sheet and rejects a missing one", async () => {
    const bytes = await writeXlsx(table);
    const parsed = await readXlsx(bytes, { sheet: "Departemen" });
    expect(parsed.rows).toHaveLength(2);
    await expect(readXlsx(bytes, { sheet: "Hilang" })).rejects.toThrow("XLSX_SHEET_NOT_FOUND");
  });
});
