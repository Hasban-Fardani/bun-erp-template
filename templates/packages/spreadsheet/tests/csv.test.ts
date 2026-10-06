import { describe, expect, test } from "bun:test";
import { parseCsv, parseCsvStream, stringifyCsv } from "../src/server/csv.ts";

describe("csv", () => {
  test("round-trips quoted fields and embedded newlines", () => {
    const table = {
      headers: ["name", "note", "amount"],
      rows: [
        ["Keuangan", 'kata "kunci", di dalam kutip', "1200"],
        ["Operasi", "baris pertama\nbaris kedua", "340"],
      ],
    };
    const text = stringifyCsv(table);
    const parsed = parseCsv(text);
    expect(parsed.headers).toEqual(table.headers);
    expect(parsed.rows).toEqual(table.rows);
  });

  test("detects the semicolon delimiter Excel writes in an Indonesian locale", () => {
    const text = "name;code;active\r\nKeuangan;KEU;ya\r\nOperasi;OPS;tidak\r\n";
    const parsed = parseCsv(text);
    expect(parsed.headers).toEqual(["name", "code", "active"]);
    expect(parsed.rows).toEqual([
      ["Keuangan", "KEU", "ya"],
      ["Operasi", "OPS", "tidak"],
    ]);
  });

  test("accepts an explicit tab delimiter", () => {
    const parsed = parseCsv("a\tb\n1\t2\n", { delimiter: "\t" });
    expect(parsed.rows).toEqual([["1", "2"]]);
  });

  test("strips a UTF-8 BOM and can write one back", () => {
    const parsed = parseCsv("\uFEFFname,code\nKeuangan,KEU\n");
    expect(parsed.headers).toEqual(["name", "code"]);
    const written = stringifyCsv({ headers: ["name"], rows: [["Keuangan"]] }, { includeBom: true });
    expect(written.startsWith("\uFEFF")).toBe(true);
    expect(parseCsv(written).rows).toEqual([["Keuangan"]]);
  });

  test("skips fully empty rows and keeps a quoted empty cell", () => {
    const parsed = parseCsv('a,b\n\n"",2\n');
    expect(parsed.rows).toEqual([["", "2"]]);
  });

  test("streams a chunked source across a quoted newline boundary", async () => {
    const source = ["name,note\r\n", 'Keuangan,"baris ', "pertama\nbaris", ' kedua"\r\nOperasi,singkat\r\n'];
    async function* chunks() {
      for (const chunk of source) yield chunk;
    }
    const streamed = await parseCsvStream(chunks());
    expect(streamed).toEqual(parseCsv(source.join("")));
    expect(streamed.rows).toEqual([
      ["Keuangan", "baris pertama\nbaris kedua"],
      ["Operasi", "singkat"],
    ]);
  });

  test("streams byte chunks and auto-detects the delimiter", async () => {
    async function* chunks() {
      yield new TextEncoder().encode("name;code\n");
      yield new TextEncoder().encode("Keuangan;KEU\n");
    }
    const streamed = await parseCsvStream(chunks());
    expect(streamed.headers).toEqual(["name", "code"]);
    expect(streamed.rows).toEqual([["Keuangan", "KEU"]]);
  });
});
