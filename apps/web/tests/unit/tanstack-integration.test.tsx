import { expect, test } from "bun:test";
import { FormErrors } from "@bun-erp/ui/molecules/form-errors.tsx";
import { DataTable } from "@bun-erp/ui/organisms/data-table.tsx";
import { FormApi } from "@tanstack/react-form";
import { renderToStaticMarkup } from "react-dom/server";

test("server sorted table preserves API order without sorting the current page in browser", () => {
  const columns = [
    { key: "name", header: "Name", cell: (row: { id: string; name: string }) => row.name, sortable: true },
  ];
  const rows = [
    { id: "two", name: "Zulu" },
    { id: "one", name: "Alpha" },
  ];
  const renderTable = (dir: "asc" | "desc") =>
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

  const ascending = renderTable("asc");
  expect(ascending.indexOf("Zulu")).toBeLessThan(ascending.indexOf("Alpha"));
  expect(ascending).toContain('aria-sort="ascending"');
  expect(ascending.match(/Zulu/g)).toHaveLength(2);

  const descending = renderTable("desc");
  expect(descending.indexOf("Zulu")).toBeLessThan(descending.indexOf("Alpha"));
  expect(descending).toContain('aria-sort="descending"');
});

test("TanStack form field maps produce one accessible summary without duplicate messages", () => {
  const html = renderToStaticMarkup(
    <FormErrors errors={[{ fields: { email: "Email invalid", password: "Password required" } }, "Email invalid"]} />,
  );
  expect(html).toContain('role="alert"');
  expect(html.match(/Email invalid/g)).toHaveLength(1);
  expect(html).toContain("Password required");
  expect(renderToStaticMarkup(<FormErrors errors={[]} />)).toBe("");
});

test("TanStack form rejects an invalid submit and exposes field validation before invoking mutation", async () => {
  let submissions = 0;
  const form = new FormApi({
    defaultValues: { email: "" },
    validators: {
      onSubmit: ({ value }) => (value.email.includes("@") ? undefined : "Email invalid"),
    },
    onSubmit: () => {
      submissions += 1;
    },
  });
  const unmount = form.mount();
  try {
    await form.handleSubmit();
    expect(submissions).toBe(0);
    const errors = [
      ...form.state.errors,
      ...Object.values(form.state.fieldMeta).flatMap((field) => field?.errors ?? []),
    ];
    expect(renderToStaticMarkup(<FormErrors errors={errors} />)).toContain("Email invalid");
    form.setFieldValue("email", "owner@example.test");
    await form.handleSubmit();
    expect(submissions).toBe(1);
  } finally {
    unmount();
  }
});
