import { expect, test } from "bun:test";
import { FormErrors } from "@bun-erp/ui/molecules/form-errors.tsx";
import { FormApi } from "@tanstack/react-form";
import { renderToStaticMarkup } from "react-dom/server";

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
