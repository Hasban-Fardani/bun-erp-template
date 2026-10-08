import { resolve } from "node:path";
import commandTemplate from "../../templates/generators/command/command.ts.tmpl" with { type: "text" };
import commandTestTemplate from "../../templates/generators/command/test.ts.tmpl" with { type: "text" };
import jobHandlerTemplate from "../../templates/generators/job/handler.ts.tmpl" with { type: "text" };
import jobTestTemplate from "../../templates/generators/job/test.ts.tmpl" with { type: "text" };
import mailTemplate from "../../templates/generators/mail/mail.ts.tmpl" with { type: "text" };
import mailTestTemplate from "../../templates/generators/mail/test.ts.tmpl" with { type: "text" };
import notificationDefinitionTemplate from "../../templates/generators/notification/definition.ts.tmpl" with {
  type: "text",
};
import notificationTestTemplate from "../../templates/generators/notification/test.ts.tmpl" with { type: "text" };
import fixtureTestTemplate from "../../templates/generators/test/fixture.test.ts.tmpl" with { type: "text" };
import httpTestTemplate from "../../templates/generators/test/http.test.ts.tmpl" with { type: "text" };
import { writeScaffold } from "./scaffold.ts";
import { renderFactoryForSchema, toKebabName, toPascalName } from "./scaffolding.ts";
import { renderTemplate } from "./template.ts";
import type { WiringEdit } from "./wiring.ts";

/**
 * Plans for the small generators: `make:factory`, `make:job`, `make:command`, `make:test`,
 * `make:notification` and `make:mail`. Like `make:feature`, every plan validates its inputs, target
 * paths and wiring anchors before anything is written, so a refusal leaves the tree untouched.
 * `writeMakePlan` applies a plan; a second run of the same generator fails on the first existing
 * file instead of overwriting it.
 */

export type MakePlan = {
  files: ReadonlyArray<{ path: string; contents: string }>;
  /** Edits to existing core files; only `added` edits are written. */
  edits: WiringEdit[];
};

const JOBS_REGISTRY = "apps/server/features/jobs.ts";
const JOBS_MARKER = "// @erp:jobs";
const NOTIFICATIONS_INDEX = "apps/server/features/notifications/index.ts";
const NOTIFICATIONS_MARKER = "// @erp:notifications";
const MAIL_WIRING = "apps/server/features/mail/wiring.ts";
/** The registry accepts only these job names (infra/jobs/registry.ts); fail here, not at boot. */
const JOB_NAME = /^[a-z][a-z0-9_.-]{1,119}$/;
const COMMAND_NAME = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)*$/;
const EVENT_TYPE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

async function exists(root: string, path: string): Promise<boolean> {
  return Bun.file(resolve(root, path)).exists();
}

async function readOptional(root: string, path: string): Promise<string | undefined> {
  const file = Bun.file(resolve(root, path));
  return (await file.exists()) ? file.text() : undefined;
}

async function assertNoOverwrite(root: string, files: ReadonlyArray<{ path: string }>): Promise<void> {
  for (const file of files) {
    if (await exists(root, file.path)) throw new Error(`Refusing to overwrite existing file: ${file.path}`);
  }
}

/** `send-invoice` to `SEND_INVOICE`. */
function toConstantName(kebab: string): string {
  return kebab.toUpperCase().replaceAll("-", "_");
}

/** `invoice-paid` to `Invoice paid`: the default human title of a generated message. */
function toTitle(kebab: string): string {
  const words = kebab.replaceAll("-", " ");
  return `${words[0]?.toUpperCase() ?? ""}${words.slice(1)}`;
}

/** Applies a plan; returns every touched repo path (files first, then edited core files). */
export async function writeMakePlan(root: string, plan: MakePlan): Promise<string[]> {
  const touched: string[] = [];
  for (const file of plan.files) {
    await writeScaffold(resolve(root, file.path), file.contents);
    touched.push(file.path);
  }
  for (const edit of plan.edits) {
    if (edit.status !== "added") continue;
    await Bun.write(resolve(root, edit.path), edit.source);
    touched.push(edit.path);
  }
  return touched;
}

/** `make:factory <feature>`: a factory beside the others, bound to the feature's table. */
export async function planMakeFactory(
  root: string,
  rawFeature: string,
  options: { table?: string } = {},
): Promise<MakePlan> {
  const name = toKebabName(rawFeature, "Feature");
  const schemaPath = `apps/server/features/${name}/schema.ts`;
  const schema = await readOptional(root, schemaPath);
  if (schema === undefined) {
    throw new Error(`No ${schemaPath}; run \`bun erp make:feature ${name}\` or write the schema first.`);
  }
  const tables = [...schema.matchAll(/export const (\w+) = pgTable\(/g)].map((match) => match[1] ?? "");
  const table = options.table ?? (tables.length === 1 ? tables[0] : undefined);
  if (!table) {
    throw new Error(
      `${schemaPath} exports ${tables.length === 0 ? "no tables" : `${tables.length} tables (${tables.join(", ")})`}; ` +
        "pass --table <exportName> to choose one.",
    );
  }
  if (!tables.includes(table)) throw new Error(`${schemaPath} has no table export named "${table}".`);
  const files = [
    {
      path: `apps/server/database/factories/${name}.ts`,
      contents: renderFactoryForSchema({ name, export: table, schemaSource: schema }),
    },
  ];
  await assertNoOverwrite(root, files);
  return { files, edits: [] };
}

/** `make:job <name>`: a handler under `apps/server/jobs/`, its test, and the registry entry. */
export async function planMakeJob(root: string, rawName: string): Promise<MakePlan> {
  const jobName = rawName.trim();
  if (!JOB_NAME.test(jobName)) {
    throw new Error("Job name must be a stable lowercase identifier such as invoice.send or send-invoice");
  }
  const file = toKebabName(jobName, "Job");
  const pascal = toPascalName(file);
  const constant = toConstantName(file);
  const files = [
    {
      path: `apps/server/jobs/${file}.ts`,
      contents: renderTemplate(jobHandlerTemplate, { constant, jobName, pascal }, "job handler"),
    },
    {
      path: `apps/server/tests/features/jobs/${file}.test.ts`,
      contents: renderTemplate(jobTestTemplate, { constant, jobName, file }, "job test"),
    },
  ];
  await assertNoOverwrite(root, files);

  const registry = await readOptional(root, JOBS_REGISTRY);
  if (registry === undefined) throw new Error(`Cannot register the job: ${JOBS_REGISTRY} is missing.`);
  if (!registry.includes(JOBS_MARKER)) {
    throw new Error(
      `Cannot register the job in ${JOBS_REGISTRY}: its ${JOBS_MARKER} marker is missing. Restore the marker or register the handler manually.`,
    );
  }
  const importLine = `import { handle${pascal}, ${constant}_JOB } from "../jobs/${file}.ts";`;
  const registration = `  registry.register(${constant}_JOB, handle${pascal});`;
  const next = `${importLine}\n${registry.replace(JOBS_MARKER, () => `${JOBS_MARKER}\n${registration}`)}`;
  return { files, edits: [{ path: JOBS_REGISTRY, source: next, status: "added" }] };
}

/** `make:command <group:name>`: a server CLI command; the registry discovers its `defineCommand` literal. */
export async function planMakeCommand(root: string, rawName: string): Promise<MakePlan> {
  const command = rawName.trim();
  if (!COMMAND_NAME.test(command)) {
    throw new Error("Command name must look like invoices:export (lowercase words joined by dashes and colons)");
  }
  for (const glob of ["cli/commands/**/*.ts", "apps/*/cli/commands/**/*.ts", "packages/*/cli/commands/**/*.ts"]) {
    for await (const path of new Bun.Glob(glob).scan({ cwd: root, onlyFiles: true })) {
      const source = await Bun.file(resolve(root, path)).text();
      if (source.includes(`defineCommand("${command}"`)) {
        throw new Error(`Command ${command} is already declared in ${path}`);
      }
    }
  }
  const file = command.replaceAll(":", "-");
  const pascal = toPascalName(file);
  const files = [
    {
      path: `apps/server/cli/commands/${file}.ts`,
      contents: renderTemplate(commandTemplate, { command, pascal }, "command"),
    },
    {
      path: `apps/server/tests/unit/${file}-command.test.ts`,
      contents: renderTemplate(commandTestTemplate, { command, pascal, file }, "command test"),
    },
  ];
  await assertNoOverwrite(root, files);
  return { files, edits: [] };
}

/** The mount segment of a feature's routes: `defineFeature({ name, path? })`, else its name. */
function mountSegment(featureSource: string, fallback: string): string {
  const path = /\bpath:\s*"([^"]+)"/.exec(featureSource)?.[1];
  return path ?? /\bname:\s*"([^"]+)"/.exec(featureSource)?.[1] ?? fallback;
}

/** `make:test <feature> [name]`: a skeleton under `tests/features/<feature>/`. */
export async function planMakeTest(root: string, rawFeature: string, rawName?: string): Promise<MakePlan> {
  const feature = toKebabName(rawFeature, "Feature");
  const hasFeature =
    (await exists(root, `apps/server/features/${feature}.ts`)) ||
    (await new Bun.Glob(`apps/server/features/${feature}/*`).scan({ cwd: root }).next()).done === false;
  if (!hasFeature) throw new Error(`No server feature at apps/server/features/${feature}.`);
  const file = rawName ? toKebabName(rawName, "Test") : `${feature}-extra`;
  const title = toTitle(rawName ? file : "extra behaviour");

  const featureSource = await readOptional(root, `apps/server/features/${feature}/feature.ts`);
  const routeSource = await readOptional(root, `apps/server/features/${feature}/route.ts`);
  const listsAtRoot = featureSource !== undefined && routeSource !== undefined && /\.get\(\s*"\/"/.test(routeSource);
  let contents: string;
  if (listsAtRoot) {
    const mount = mountSegment(featureSource, feature);
    const access = /^[A-Za-z_$][\w$]*$/.test(mount) ? `.${mount}` : `[${JSON.stringify(mount)}]`;
    contents = renderTemplate(httpTestTemplate, { name: feature, title, mount: access }, "http test");
  } else {
    contents = renderTemplate(fixtureTestTemplate, { name: feature, title }, "fixture test");
  }
  const files = [{ path: `apps/server/tests/features/${feature}/${file}.test.ts`, contents }];
  await assertNoOverwrite(root, files);
  return { files, edits: [] };
}

/** `make:notification <name>`: a database-channel definition exported from the public surface. */
export async function planMakeNotification(
  root: string,
  rawName: string,
  options: { type?: string } = {},
): Promise<MakePlan> {
  const name = toKebabName(rawName, "Notification");
  let type = options.type;
  if (!type) {
    const [domain, ...event] = name.split("-");
    if (!domain || event.length === 0) {
      throw new Error("Name the notification domain-event (invoice-paid) or pass --type domain.event");
    }
    type = `${domain}.${event.join("_")}`;
  }
  if (!EVENT_TYPE.test(type))
    throw new Error("Notification type must be a stable domain.event name such as invoice.paid");
  const pascal = toPascalName(name);
  const constant = toConstantName(name);
  const files = [
    {
      path: `apps/server/features/notifications/${name}.notification.ts`,
      contents: renderTemplate(
        notificationDefinitionTemplate,
        { constant, pascal, type, title: toTitle(name) },
        "notification definition",
      ),
    },
    {
      path: `apps/server/tests/features/notifications/${name}.test.ts`,
      contents: renderTemplate(notificationTestTemplate, { constant, pascal, type }, "notification test"),
    },
  ];
  await assertNoOverwrite(root, files);

  const index = await readOptional(root, NOTIFICATIONS_INDEX);
  if (index === undefined) throw new Error(`Cannot export the notification: ${NOTIFICATIONS_INDEX} is missing.`);
  if (!index.includes(NOTIFICATIONS_MARKER)) {
    throw new Error(
      `Cannot export the notification from ${NOTIFICATIONS_INDEX}: its ${NOTIFICATIONS_MARKER} marker is missing. Restore the marker or export it manually.`,
    );
  }
  const exportLine = `export { ${constant}_NOTIFICATION, send${pascal}Notification } from "./${name}.notification.ts";`;
  const next = index.replace(NOTIFICATIONS_MARKER, () => `${exportLine}\n${NOTIFICATIONS_MARKER}`);
  return { files, edits: [{ path: NOTIFICATIONS_INDEX, source: next, status: "added" }] };
}

/** `make:mail <name>`: a pure renderer plus a queue helper; only when the mail feature is installed. */
export async function planMakeMail(root: string, rawName: string): Promise<MakePlan> {
  if (!(await exists(root, MAIL_WIRING))) {
    throw new Error("The mail feature is not installed. Run `bun erp features:install mail` first.");
  }
  const file = toKebabName(rawName, "Mail");
  const pascal = toPascalName(file);
  const files = [
    {
      path: `apps/server/mail/${file}.ts`,
      contents: renderTemplate(mailTemplate, { pascal, title: toTitle(file) }, "mail"),
    },
    {
      path: `apps/server/tests/features/mail/${file}.test.ts`,
      contents: renderTemplate(mailTestTemplate, { pascal, file }, "mail test"),
    },
  ];
  await assertNoOverwrite(root, files);
  return { files, edits: [] };
}
