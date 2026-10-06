import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type Column, DataTable } from "../src/server-table";

type Row = { id: string; name: string; role: string };
const columns: Column<Row>[] = [
  { key: "name", header: "Nama", cell: (row) => row.name, sortable: true },
  { key: "role", header: "Peran", cell: (row) => row.role, secondary: true },
];

function renderTable(options: { rows: Row[]; pending?: boolean; error?: string }) {
  return renderToStaticMarkup(
    <DataTable
      columns={columns}
      rows={options.rows}
      rowKey={(row) => row.id}
      sort="name"
      dir="asc"
      onSort={() => {}}
      empty={{ filtered: false }}
      pending={options.pending}
      error={options.error}
      actions={(row) => <button type="button">Open {row.name}</button>}
    />,
  );
}

test("first table load exposes an accessible skeleton status", () => {
  const html = renderTable({ rows: [], pending: true });
  expect(html).toContain('role="status"');
  expect(html).toContain("Loading data");
  expect(html).toContain("animate-pulse");
});

test("refresh failure keeps existing rows visible and reports the stale-data state", () => {
  const html = renderTable({ rows: [{ id: "one", name: "Existing row", role: "Administrator" }], error: "Coba lagi." });
  expect(html).toContain("Existing row");
  expect(html).toContain('role="alert"');
  expect(html).toContain("Previously loaded data is still shown");
  expect(html).toContain('aria-sort="ascending"');
  expect(html).toContain("md:hidden");
  expect(html).toContain("Administrator");
  expect(html.match(/Open Existing row/g)).toHaveLength(2);
});

test("server sorted table preserves API order without sorting the current page in browser", () => {
  const rows = [
    { id: "two", name: "Zulu", role: "staff" },
    { id: "one", name: "Alpha", role: "staff" },
  ];
  const renderSorted = (dir: "asc" | "desc") =>
    renderToStaticMarkup(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        sort="name"
        dir={dir}
        onSort={() => {}}
        empty={{ filtered: false }}
      />,
    );

  const ascending = renderSorted("asc");
  expect(ascending.indexOf("Zulu")).toBeLessThan(ascending.indexOf("Alpha"));
  expect(ascending).toContain('aria-sort="ascending"');
  expect(ascending.match(/Zulu/g)).toHaveLength(2);

  const descending = renderSorted("desc");
  expect(descending.indexOf("Zulu")).toBeLessThan(descending.indexOf("Alpha"));
  expect(descending).toContain('aria-sort="descending"');
});
