import { afterAll, beforeEach, expect, test } from "bun:test";
import { createUuid } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import { rowsOf } from "../../../database/rows.ts";
import { registerImportExportBatchHandlers } from "../../../features/import-export/jobs.ts";
import {
  type ImportExportResource,
  importExportResources,
  registerImportExportResource,
} from "../../../features/import-export/registry.ts";
import { buildDryRun, selectExportData, startImport } from "../../../features/import-export/service.ts";
import { BatchHandlerRegistry, processJobBatch } from "../../../infra/jobs/batch.ts";
import type { Logger } from "../../../infra/observability/logger.ts";
import { createHttpFixture, dataOf, type HttpFixture } from "../../support/fixtures.ts";

const logger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

/** A tiny real table keeps the test resource honest: it imports and exports actual rows. */
const TEST_TABLE = `
  create table if not exists import_export_test_rows (
    id text primary key,
    name text not null,
    code text not null unique,
    amount integer not null default 0
  )
`;

registerImportExportResource({
  name: "test-rows",
  label: "Test rows",
  columns: [
    { key: "name", header: "Name", required: true, width: 24 },
    { key: "code", header: "Code", required: true },
    { key: "amount", header: "Amount", numFmt: "#,##0" },
  ],
  validateRow: (values) =>
    values.amount && !/^\d+$/.test(values.amount)
      ? [{ column: "amount", code: "NOT_A_NUMBER", message: "Amount must be a number" }]
      : [],
  importRow: async (db, values) => {
    await db.execute(sql`
      insert into import_export_test_rows (id, name, code, amount)
      values (${createUuid()}, ${values.name ?? ""}, ${values.code ?? ""}, ${Number(values.amount ?? 0)})
      on conflict (code) do update set name = excluded.name, amount = excluded.amount
    `);
  },
  list: async (db, query) => {
    const search = query.search?.trim() ? `%${query.search.trim()}%` : null;
    const where = sql`(${search}::text is null or name ilike ${search} or code ilike ${search})`;
    const [items, count] = await Promise.all([
      db.execute(sql`
        select id, name, code, amount from import_export_test_rows
        where ${where}
        order by code asc limit ${query.perPage} offset ${(query.page - 1) * query.perPage}
      `),
      db.execute(sql`select count(*)::int as total from import_export_test_rows where ${where}`),
    ]);
    return { items: rowsOf<Record<string, unknown>>(items), total: rowsOf<{ total: number }>(count)[0]?.total ?? 0 };
  },
});

/** The shape the web sends after parsing a file: headers plus string rows. */
const SOURCE = {
  resource: "test-rows",
  headers: ["Name", "Code", "Amount"],
  rows: [
    ["Keuangan", "KEU", "1200"],
    ["Operasi", "OPS", "banyak"],
    ["Hilang", "", "10"],
  ],
};

let api: HttpFixture;

beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
  await api.ctx.db.execute(sql.raw(TEST_TABLE));
  await api.ctx.db.execute(sql`truncate table import_export_test_rows`);
}, 30_000);

afterAll(async () => {
  await api?.close();
});

test("dry run reports row-level errors and confirms only valid rows", async () => {
  const dryRun = await api.client.api.v1["import-export"].imports["dry-run"].$post({ json: SOURCE });
  expect(dryRun.status).toBe(200);
  const report = await dataOf<{
    total: number;
    valid: number;
    invalid: number;
    mapping: Record<string, string>;
    errors: { row: number; column: string | null; code: string }[];
  }>(Promise.resolve(dryRun));
  expect(report.total).toBe(3);
  expect(report.valid).toBe(1);
  expect(report.invalid).toBe(2);
  // Mapping was auto-derived from the header names and echoed back.
  expect(report.mapping).toEqual({ Name: "name", Code: "code", Amount: "amount" });
  expect(report.errors).toContainEqual(expect.objectContaining({ row: 3, column: "amount", code: "NOT_A_NUMBER" }));
  expect(report.errors).toContainEqual(expect.objectContaining({ row: 4, column: "code", code: "REQUIRED" }));

  const confirm = await api.client.api.v1["import-export"].imports.$post({ json: SOURCE });
  expect(confirm.status).toBe(200);
  const started = (await confirm.json()) as { data: { batchId: string } };
  expect(started.data.batchId).toMatch(/^[0-9a-f-]{36}$/);

  const handlers = new BatchHandlerRegistry();
  registerImportExportBatchHandlers(handlers, api.ctx);
  const progress = await processJobBatch(api.ctx.db, started.data.batchId, handlers, logger);
  expect(progress).toMatchObject({ status: "completed", total: 1, processed: 1, failed: 0 });

  const rows = rowsOf<{ name: string; code: string; amount: number }>(
    await api.ctx.db.execute(sql`select name, code, amount from import_export_test_rows`),
  );
  expect(rows).toEqual([{ name: "Keuangan", code: "KEU", amount: 1200 }]);

  const notification = rowsOf<{ title: string; body: string }>(
    await api.ctx.db.execute(sql`select title, body from notifications order by created_at desc limit 1`),
  )[0];
  expect(notification?.title).toBe("Test rows: import finished");
  expect(notification?.body).toBe("1 of 1 rows imported.");
});

test("progress, cancel and resume travel through the API", async () => {
  const started = await startImport(api.ctx.db, {
    resource: testResource(),
    source: {
      headers: ["Name", "Code"],
      rows: [
        ["A", "AA"],
        ["B", "BB"],
      ],
    },
    mapping: { Name: "name", Code: "code" },
    actor: { userId: null, traceId: "" },
  });

  const progress = await api.client.api.v1["import-export"].imports[":id"].$get({
    param: { id: started.batchId },
  });
  expect(progress.status).toBe(200);
  expect(((await progress.json()) as { data: { status: string } }).data.status).toBe("pending");

  const cancelled = await api.client.api.v1["import-export"].imports[":id"].cancel.$post({
    param: { id: started.batchId },
  });
  expect(((await cancelled.json()) as { data: { cancelled: boolean } }).data.cancelled).toBe(true);

  const resumed = await api.client.api.v1["import-export"].imports[":id"].resume.$post({
    param: { id: started.batchId },
  });
  expect(((await resumed.json()) as { data: { resumed: boolean } }).data.resumed).toBe(true);

  const handlers = new BatchHandlerRegistry();
  registerImportExportBatchHandlers(handlers, api.ctx);
  const finished = await processJobBatch(api.ctx.db, started.batchId, handlers, logger);
  expect(finished).toMatchObject({ status: "completed", processed: 2, failed: 0 });
});

test("export returns only the selected columns from the list contract", async () => {
  await api.ctx.db.execute(sql`
    insert into import_export_test_rows (id, name, code, amount) values
      (${createUuid()}, 'Keuangan', 'KEU', 1200),
      (${createUuid()}, 'Operasi', 'OPS', 340)
  `);

  const response = await api.client.api.v1["import-export"].exports[":resource"].$get({
    param: { resource: "test-rows" },
    query: { columns: "code,name", sort: "code" },
  });
  expect(response.status).toBe(200);
  const body = await dataOf<{ columns: { key: string }[]; rows: unknown[][]; total: number }>(
    Promise.resolve(response),
  );
  expect(body.columns.map((column) => column.key)).toEqual(["code", "name"]);
  expect(body.rows).toEqual([
    ["KEU", "Keuangan"],
    ["OPS", "Operasi"],
  ]);
  expect(body.total).toBe(2);
});

test("export column selection rejects unknown columns", async () => {
  const response = await api.client.api.v1["import-export"].exports[":resource"].$get({
    param: { resource: "test-rows" },
    query: { columns: "missing" },
  });
  expect(response.status).toBe(422);
});

test("anonymous callers are rejected before the pipeline runs", async () => {
  const response = await api.app.request("/api/v1/import-export/imports", { method: "GET" });
  expect(response.status).toBe(401);
  const missing = await api.client.api.v1["import-export"].imports[":id"].$get({
    param: { id: createUuid() },
  });
  expect(missing.status).toBe(404);
});

test("dry run rejects a mapping that omits a required column", async () => {
  const response = await api.client.api.v1["import-export"].imports["dry-run"].$post({
    json: {
      resource: "test-rows",
      headers: ["Name", "Amount"],
      rows: [["A", "1"]],
      mapping: { Name: "name", Amount: "amount" },
    },
  });
  expect(response.status).toBe(422);
  const body = (await response.json()) as { error: { fields: { path: string }[] } };
  expect(body.error.fields.map((field) => field.path)).toContain("mapping.code");
});

test("buildDryRun exposes the valid rows it would import", () => {
  const { report, rows } = buildDryRun(
    testResource(),
    {
      headers: ["Name", "Code", "Amount"],
      rows: [
        ["A", "AA", "1"],
        ["B", "BB", "x"],
      ],
    },
    { Name: "name", Code: "code", Amount: "amount" },
  );
  expect(report.valid).toBe(1);
  expect(report.preview).toEqual([{ row: 2, values: { name: "A", code: "AA", amount: "1" } }]);
  expect(rows).toHaveLength(1);
});

test("selectExportData returns the full set in the selected columns", async () => {
  const values = Array.from(
    { length: 7 },
    (_, index) => sql`(${createUuid()}, ${`Row ${index}`}, ${`R${index}`}, ${index})`,
  );
  await api.ctx.db.execute(
    sql`insert into import_export_test_rows (id, name, code, amount) values ${sql.join(values, sql`, `)}`,
  );
  const data = await selectExportData(api.ctx.db, {
    resource: testResource(),
    query: { page: 1, perPage: 2, sort: "code", dir: "asc" },
  });
  expect(data.rows).toHaveLength(7);
  expect(data.rows[0]).toEqual(["Row 0", "R0", 0]);
});

function testResource(): ImportExportResource {
  const resource = importExportResources.get("test-rows");
  if (!resource) throw new Error("The test resource was not registered");
  return resource;
}
