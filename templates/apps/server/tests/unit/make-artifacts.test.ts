import { expect, test } from "bun:test";
import {
  type MakePlan,
  planMakeCommand,
  planMakeEvent,
  planMakeFactory,
  planMakeJob,
  planMakeListener,
  planMakeMail,
  planMakeNotification,
  planMakeTest,
  writeMakePlan,
} from "@cli/lib/make-artifacts.ts";
import { repoRoot } from "@cli/lib/repo.ts";
import { withTempRoot } from "./support/temp-root.ts";

/**
 * Contract for the small generators (`make:factory`, `make:job`, `make:command`, `make:test`,
 * `make:notification`, `make:mail`). Each plans every path and wiring anchor before it writes
 * anything, refuses to overwrite, and emits syntactically valid TypeScript. Typechecking the real
 * output is covered by running the generators in an installed repo (docs/development.md).
 */

const transpiler = new Bun.Transpiler({ loader: "ts" });

async function realFile(path: string): Promise<string> {
  return Bun.file(`${repoRoot}/${path}`).text();
}

async function baseRoot(): Promise<Record<string, string>> {
  return {
    "apps/server/features/jobs.ts": await realFile("templates/apps/server/features/jobs.ts"),
    "apps/server/features/events.ts": await realFile("templates/apps/server/features/events.ts"),
    "apps/server/features/notifications/index.ts": await realFile(
      "templates/apps/server/features/notifications/index.ts",
    ),
    "apps/server/features/invoices/schema.ts": [
      'import { pgTable, uuid } from "drizzle-orm/pg-core";',
      'export const invoices = pgTable("invoices", { id: uuid("id").primaryKey() });',
    ].join("\n"),
    "apps/server/features/invoices/route.ts": 'export const invoicesRoutes = () => app.get(\n  "/",\n  () => null,\n);',
    "apps/server/features/invoices/feature.ts":
      'export const invoicesFeature = defineFeature({ name: "invoices", routes: invoicesRoutes });',
    "apps/server/features/mail/wiring.ts": "export {};",
  };
}

function assertValidTypeScript(plan: MakePlan): void {
  for (const file of plan.files) expect(() => transpiler.transformSync(file.contents)).not.toThrow();
}

/** Writes the plan, asserts it touched `path` and returns that file's new source. */
async function applyAndRead(root: string, plan: MakePlan, path: string): Promise<string> {
  expect(await writeMakePlan(root, plan)).toContain(path);
  return Bun.file(`${root}/${path}`).text();
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for await (const file of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true })) {
    files[file] = await Bun.file(`${root}/${file}`).text();
  }
  return files;
}

test("make:factory wires a factory to the feature schema and refuses to overwrite it", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    const plan = await planMakeFactory(root, "invoices");
    assertValidTypeScript(plan);
    expect(plan.files.map((file) => file.path)).toEqual(["apps/server/database/factories/invoices.ts"]);
    const source = plan.files[0]?.contents ?? "";
    expect(source).toContain('import { invoices } from "../../features/invoices/schema.ts";');
    expect(source).toContain("export const invoicesFactory = defineFactory(invoices,");

    await writeMakePlan(root, plan);
    await expect(planMakeFactory(root, "invoices")).rejects.toThrow(/Refusing to overwrite/);
  });
});

test("make:factory fills the number column of a sequenced table and honours --table", async () => {
  const files = {
    ...(await baseRoot()),
    "apps/server/features/orders/schema.ts": [
      'export const purchaseOrders = pgTable("orders", {',
      '  number: text("number").notNull(),',
      "});",
      'export const orderLines = pgTable("order_lines", {});',
    ].join("\n"),
  };
  await withTempRoot(files, async (root) => {
    await expect(planMakeFactory(root, "orders")).rejects.toThrow(/--table/);
    const plan = await planMakeFactory(root, "orders", { table: "purchaseOrders" });
    assertValidTypeScript(plan);
    expect(plan.files[0]?.contents).toContain("number: `ORDERS-$" + "{n}`");
  });
});

test("make:factory fills every required column it can and marks foreign keys as overrides", async () => {
  const files = {
    ...(await baseRoot()),
    "apps/server/features/tickets/schema.ts": [
      "export const tickets = pgTable(",
      '  "tickets",',
      "  {",
      '    id: uuid("id").primaryKey().default(sql`uuidv7()`),',
      '    userId: uuid("user_id")',
      "      .notNull()",
      '      .references(() => users.id, { onDelete: "cascade" }),',
      '    title: text("title").notNull(),',
      '    note: text("note").notNull().default(""),',
      '    priority: integer("priority").notNull(),',
      '    closed: boolean("closed").notNull(),',
      '    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),',
      '    meta: jsonb("meta"),',
      "  },",
      '  (table) => [index("tickets_user_idx").on(table.userId)],',
      ");",
    ].join("\n"),
  };
  await withTempRoot(files, async (root) => {
    const plan = await planMakeFactory(root, "tickets");
    assertValidTypeScript(plan);
    const source = plan.files[0]?.contents ?? "";
    expect(source).toContain('import { defineFactory, requiredOverride } from "./define.ts";');
    expect(source).toContain('userId: requiredOverride("userId")');
    expect(source).toContain("title: `title $" + "{n}`");
    expect(source).toContain("priority: n");
    expect(source).toContain("closed: false");
    // Defaulted and nullable columns are left to the database.
    expect(source).not.toContain("note:");
    expect(source).not.toContain("openedAt");
    expect(source).not.toContain("meta");
    expect(source).toContain("(n) =>");
  });
});

test("make:factory needs an existing feature schema", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    await expect(planMakeFactory(root, "ghosts")).rejects.toThrow(/features\/ghosts\/schema\.ts/);
  });
});

test("make:job writes a handler, an idempotency test and registers it in features/jobs.ts", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    const plan = await planMakeJob(root, "send-invoice");
    assertValidTypeScript(plan);
    expect(plan.files.map((file) => file.path)).toEqual([
      "apps/server/jobs/send-invoice.ts",
      "apps/server/tests/features/jobs/send-invoice.test.ts",
    ]);
    const touched = await writeMakePlan(root, plan);
    expect(touched).toContain("apps/server/features/jobs.ts");

    const registry = await Bun.file(`${root}/apps/server/features/jobs.ts`).text();
    expect(registry).toContain('import { handleSendInvoice, SEND_INVOICE_JOB } from "../jobs/send-invoice.ts";');
    expect(registry).toContain("registry.register(SEND_INVOICE_JOB, handleSendInvoice);");
    // The registration lands inside createJobRegistry, before it returns.
    expect(registry.indexOf("registry.register(SEND_INVOICE_JOB")).toBeLessThan(registry.indexOf("return registry;"));

    const test = await Bun.file(`${root}/apps/server/tests/features/jobs/send-invoice.test.ts`).text();
    expect(test).toContain("idempotencyKey");
    expect(test).toContain("expect(await enqueueJob(db, input)).toBe(first)");

    await expect(planMakeJob(root, "send-invoice")).rejects.toThrow(/Refusing to overwrite/);
  });
});

test("make:job refuses before writing when the registry marker is missing", async () => {
  const files = await baseRoot();
  files["apps/server/features/jobs.ts"] = (files["apps/server/features/jobs.ts"] ?? "").replace("  // @erp:jobs\n", "");
  await withTempRoot(files, async (root) => {
    const before = await snapshot(root);
    await expect(planMakeJob(root, "send-invoice")).rejects.toThrow(/@erp:jobs/);
    expect(await snapshot(root)).toEqual(before);
  });
});

test("make:command emits a registered server command and its export test", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    const plan = await planMakeCommand(root, "invoices:export");
    assertValidTypeScript(plan);
    expect(plan.files.map((file) => file.path)).toEqual([
      "apps/server/cli/commands/invoices-export.ts",
      "apps/server/tests/unit/invoices-export-command.test.ts",
    ]);
    // The registry discovers commands by this literal; no second list to edit.
    expect(plan.files[0]?.contents).toContain('defineCommand("invoices:export"');
    await writeMakePlan(root, plan);
    // The second run is refused whichever guard fires first: the file or the declared name.
    await expect(planMakeCommand(root, "invoices:export")).rejects.toThrow(/already declared|Refusing to overwrite/);
  });
});

test("make:command refuses a name another command module already declares", async () => {
  const files = {
    ...(await baseRoot()),
    "apps/server/cli/commands/user.ts": 'export const commands = [defineCommand("user:list", async () => {})];',
  };
  await withTempRoot(files, async (root) => {
    await expect(planMakeCommand(root, "user:list")).rejects.toThrow(/already declared/);
    await expect(planMakeCommand(root, "Not A Name")).rejects.toThrow(/Command name/);
  });
});

test("make:test emits a typed testClient skeleton for a feature with routes", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    const plan = await planMakeTest(root, "invoices", "totals");
    assertValidTypeScript(plan);
    expect(plan.files.map((file) => file.path)).toEqual(["apps/server/tests/features/invoices/totals.test.ts"]);
    const source = plan.files[0]?.contents ?? "";
    expect(source).toContain("createTestClient(api.app)");
    expect(source).toContain("client.api.v1.invoices.$get(");
    expect(source).toContain("toBe(401)");
    await writeMakePlan(root, plan);
    await expect(planMakeTest(root, "invoices", "totals")).rejects.toThrow(/Refusing to overwrite/);
  });
});

test("make:test falls back to a fixture-only skeleton for a feature without routes", async () => {
  const files = { ...(await baseRoot()), "apps/server/features/billing/service.ts": "export {};" };
  await withTempRoot(files, async (root) => {
    const plan = await planMakeTest(root, "billing");
    assertValidTypeScript(plan);
    expect(plan.files[0]?.path).toBe("apps/server/tests/features/billing/billing-extra.test.ts");
    expect(plan.files[0]?.contents).not.toContain("client.api.v1");
    await expect(planMakeTest(root, "ghosts")).rejects.toThrow(/features\/ghosts/);
  });
});

test("make:notification writes a database-channel definition and exports it from the public surface", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    const plan = await planMakeNotification(root, "invoice-paid");
    assertValidTypeScript(plan);
    expect(plan.files.map((file) => file.path)).toEqual([
      "apps/server/features/notifications/invoice-paid.notification.ts",
      "apps/server/tests/features/notifications/invoice-paid.test.ts",
    ]);
    const definition = plan.files[0]?.contents ?? "";
    expect(definition).toContain('"invoice.paid"');
    expect(definition).toContain('via: ["database"]');
    await writeMakePlan(root, plan);

    const index = await Bun.file(`${root}/apps/server/features/notifications/index.ts`).text();
    expect(index).toContain(
      'export { INVOICE_PAID_NOTIFICATION, sendInvoicePaidNotification } from "./invoice-paid.notification.ts";',
    );
    await expect(planMakeNotification(root, "invoice-paid")).rejects.toThrow(/Refusing to overwrite/);
  });
});

test("make:notification accepts an explicit event type", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    const plan = await planMakeNotification(root, "paid", { type: "billing.invoice_paid" });
    expect(plan.files[0]?.contents).toContain('"billing.invoice_paid"');
  });
});

test("make:mail needs the mail feature and then writes a renderer, a queue helper and a test", async () => {
  const withoutMail = await baseRoot();
  delete withoutMail["apps/server/features/mail/wiring.ts"];
  await withTempRoot(withoutMail, async (root) => {
    await expect(planMakeMail(root, "welcome")).rejects.toThrow(/features:install mail/);
  });

  await withTempRoot(await baseRoot(), async (root) => {
    const plan = await planMakeMail(root, "welcome");
    assertValidTypeScript(plan);
    expect(plan.files.map((file) => file.path)).toEqual([
      "apps/server/mail/welcome.ts",
      "apps/server/tests/features/mail/welcome.test.ts",
    ]);
    const source = plan.files[0]?.contents ?? "";
    expect(source).toContain("export function renderWelcomeMail(");
    expect(source).toContain("escapeHtml(");
    expect(source).toContain("idempotencyKey");
    await writeMakePlan(root, plan);
    await expect(planMakeMail(root, "welcome")).rejects.toThrow(/Refusing to overwrite/);
  });
});

test("make:event writes a typed event definition inside the feature", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    const plan = await planMakeEvent(root, "invoices", "invoice-paid");
    assertValidTypeScript(plan);
    expect(plan.files.map((file) => file.path)).toEqual(["apps/server/features/invoices/events/invoice-paid.ts"]);
    const source = plan.files[0]?.contents ?? "";
    expect(source).toContain('defineEvent<InvoicePaidPayload>("invoices.invoice-paid")');
    expect(source).toContain("export const invoicePaidEvent");
    await writeMakePlan(root, plan);
    await expect(planMakeEvent(root, "invoices", "invoice-paid")).rejects.toThrow(/Refusing to overwrite/);
    await expect(planMakeEvent(root, "ghosts", "x-y")).rejects.toThrow(/No server feature/);
  });
});

test("make:listener writes a listener and its dispatch test, and registers it in features/events.ts", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    await writeMakePlan(root, await planMakeEvent(root, "invoices", "invoice-paid"));
    const plan = await planMakeListener(root, "invoices", "email-customer", { event: "invoice-paid" });
    assertValidTypeScript(plan);
    expect(plan.files.map((file) => file.path)).toEqual([
      "apps/server/features/invoices/listeners/email-customer.ts",
      "apps/server/tests/features/invoices/email-customer-listener.test.ts",
    ]);
    const registry = await applyAndRead(root, plan, "apps/server/features/events.ts");
    expect(registry).toContain('import { emailCustomerListener } from "./invoices/listeners/email-customer.ts";');
    expect(registry).toContain("emailCustomerListener,");
    expect(registry.indexOf("emailCustomerListener,")).toBeLessThan(registry.indexOf("];"));
    expect(() => transpiler.transformSync(registry)).not.toThrow();

    const listener = await Bun.file(`${root}/apps/server/features/invoices/listeners/email-customer.ts`).text();
    expect(listener).toContain('name: "email-customer"');
    expect(listener).toContain("event: invoicePaidEvent");
    const test = await Bun.file(`${root}/apps/server/tests/features/invoices/email-customer-listener.test.ts`).text();
    expect(test).toContain("dispatch");
    expect(test).toContain("idempotencyKey");

    await expect(planMakeListener(root, "invoices", "email-customer", { event: "invoice-paid" })).rejects.toThrow(
      /Refusing to overwrite/,
    );
  });
});

test("make:listener refuses an unknown event and a missing registry marker before writing", async () => {
  await withTempRoot(await baseRoot(), async (root) => {
    await expect(planMakeListener(root, "invoices", "email-customer", { event: "nope" })).rejects.toThrow(
      /events\/nope\.ts/,
    );
  });
  const files = await baseRoot();
  files["apps/server/features/events.ts"] = (files["apps/server/features/events.ts"] ?? "").replace(
    "// @erp:listeners",
    "",
  );
  files["apps/server/features/invoices/events/invoice-paid.ts"] = "export const invoicePaidEvent = {};";
  await withTempRoot(files, async (root) => {
    const before = await snapshot(root);
    await expect(planMakeListener(root, "invoices", "email-customer", { event: "invoice-paid" })).rejects.toThrow(
      /@erp:listeners/,
    );
    expect(await snapshot(root)).toEqual(before);
  });
});
