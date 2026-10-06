import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServerColumnHelper, type ServerTableState, useServerDataTable } from "../src/server/index";
import { Column, DataTable } from "../src/ui/index";

type Person = { id: string; name: string };

const personColumn = Column<Person>();
const columns = personColumn.columns([personColumn.accessor("name", { header: "Name" })]);

test("DataTable filters, sorts, and paginates its complete local input", () => {
  const rows: Person[] = [
    { id: "3", name: "Charlie" },
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
  ];
  const markup = renderToStaticMarkup(
    <DataTable
      ariaLabel="People"
      data={rows}
      columns={columns}
      getRowId={(person) => person.id}
      filter={{ label: "Search people" }}
      initialPageSize={1}
      initialState={{ globalFilter: "bo", sorting: [{ id: "name", desc: false }] }}
    />,
  );

  expect(markup).toContain('aria-label="People"');
  expect(markup).toContain("Bob");
  expect(markup).not.toContain("Alice");
  expect(markup).toContain("Page 1 of 1");
});

test("DataTable renders an accessible empty-result message", () => {
  const markup = renderToStaticMarkup(<DataTable data={[]} columns={columns} emptyMessage="No people match." />);

  expect(markup).toContain("No people match.");
  expect(markup).toContain('aria-label="Data table"');
});

test("server adapter keeps the loaded page while reporting the external total", () => {
  const serverColumn = createServerColumnHelper<Person>();
  const serverColumns = serverColumn.columns([serverColumn.accessor("name", { header: "Name" })]);
  const state: ServerTableState = {
    pagination: { pageIndex: 2, pageSize: 10 },
    sorting: [],
    columnFilters: [],
    globalFilter: "",
  };

  function ServerTableProbe() {
    const table = useServerDataTable({
      data: [{ id: "101", name: "Loaded row" }],
      rowCount: 100,
      columns: serverColumns,
      getRowId: (person) => person.id,
      state,
      onPaginationChange: () => undefined,
      onSortingChange: () => undefined,
      onColumnFiltersChange: () => undefined,
      onGlobalFilterChange: () => undefined,
    });

    return (
      <output>
        {table.getRowModel().rows.length}:{table.getPageCount()}:{table.getRowCount()}
      </output>
    );
  }

  const markup = renderToStaticMarkup(<ServerTableProbe />);

  expect(markup).toContain("1:10:100");
});
