import { resolve } from "node:path";
import type { InfraFeatureManifest, InfraWiringOp } from "./feature-catalog.ts";

/**
 * Installer wiring for `kind: "infra"` features. Each operation edits one fixed core file with a
 * strict anchor: a missing anchor returns `skipped` and the install aborts before writing anything,
 * so a half-wired composition root is impossible. Mail wires the composition root; organizations
 * registers the Better Auth organization plugin and its tables. Several operations may target one
 * file (organizations edits `identity/auth.ts` twice), so edits are composed per path in manifest
 * order instead of each operation overwriting the previous result.
 */

export type WiringEdit = { path: string; source: string; status: "added" | "present" | "skipped" };

type Editor = { path: string; apply: (source: string) => WiringEdit };

const MAIL_PACKAGE = "@bun-erp/mail/server";

/** Insert `line` after the first occurrence of `anchor`; `undefined` when the anchor is missing. */
function insertAfter(source: string, anchor: string, line: string): string | undefined {
  const at = source.indexOf(anchor);
  if (at === -1) return undefined;
  const end = at + anchor.length;
  return `${source.slice(0, end)}\n${line}${source.slice(end)}`;
}

function insertBefore(source: string, anchor: string, line: string): string | undefined {
  const at = source.indexOf(anchor);
  if (at === -1) return undefined;
  return `${source.slice(0, at)}${line}\n${source.slice(at)}`;
}

function replaceOnce(source: string, anchor: string, replacement: string): string | undefined {
  if (!source.includes(anchor)) return undefined;
  return source.replace(anchor, replacement);
}

/** Runs the edits in order; one missing anchor means the whole operation is skipped. */
function chain(source: string, edits: ReadonlyArray<(input: string) => string | undefined>): string | undefined {
  let next = source;
  for (const edit of edits) {
    const result = edit(next);
    if (result === undefined) return undefined;
    next = result;
  }
  return next;
}

function wireContext(source: string): WiringEdit {
  if (source.includes("mail: Mailer;")) return { path: "", source, status: "present" };
  const next = chain(source, [
    (input) =>
      insertBefore(
        input,
        'import type { Env } from "../config/index.ts";',
        `import type { Mailer } from "${MAIL_PACKAGE}";`,
      ),
    (input) => insertAfter(input, "  auth: Auth;", "  mail: Mailer;"),
  ]);
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

function wireBootstrap(source: string): WiringEdit {
  if (source.includes("createAppMailer")) return { path: "", source, status: "present" };
  const next = chain(source, [
    (input) =>
      insertAfter(
        input,
        'import { createAuth } from "../features/identity/auth.ts";',
        'import { createAppMailer } from "../features/mail/wiring.ts";',
      ),
    (input) =>
      insertAfter(input, "  const auth = createAuth(env, db);", "  const mail = createAppMailer(env, logger, db);"),
    (input) =>
      replaceOnce(
        input,
        "return { env, db, logger, auth, storage, close };",
        "return { env, db, logger, auth, mail, storage, close };",
      ),
  ]);
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

function wireCloudflare(source: string): WiringEdit {
  if (source.includes("createAppMailer")) return { path: "", source, status: "present" };
  const next = chain(source, [
    (input) =>
      insertAfter(
        input,
        'import { createAuth } from "../features/identity/auth.ts";',
        'import { createAppMailer } from "../features/mail/wiring.ts";',
      ),
    (input) =>
      insertAfter(
        input,
        '  const logger = createWorkerLogger("bun-erp", env.APP_ENV, env.APP_RELEASE);',
        "  const mail = createAppMailer(env, logger, db);",
      ),
    (input) =>
      replaceOnce(
        input,
        "return { env, db, logger, storage, close };",
        "return { env, db, logger, mail, storage, close };",
      ),
  ]);
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

function wireJobs(source: string): WiringEdit {
  if (source.includes("registerMailJobs")) return { path: "", source, status: "present" };
  const next = chain(source, [
    (input) =>
      insertAfter(
        input,
        'import { JobRegistry } from "../infra/jobs/registry.ts";',
        'import { registerMailJobs } from "./mail/wiring.ts";',
      ),
    (input) =>
      replaceOnce(
        input,
        '_ctx: Pick<AppContext, "env" | "db" | "logger">',
        'ctx: Pick<AppContext, "env" | "db" | "logger" | "mail">',
      ),
    (input) => insertAfter(input, "  const registry = new JobRegistry();", "  registerMailJobs(registry, ctx.mail);"),
  ]);
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

function wireNotificationTypes(source: string): WiringEdit {
  if (source.includes('["database", "mail"]')) return { path: "", source, status: "present" };
  const next = chain(source, [
    (input) =>
      replaceOnce(
        input,
        'export const NOTIFICATION_CHANNELS = ["database"] as const;',
        'export const NOTIFICATION_CHANNELS = ["database", "mail"] as const;',
      ),
    (input) =>
      replaceOnce(
        input,
        'Pick<AppContext, "db" | "logger" | "env">',
        'Pick<AppContext, "db" | "mail" | "logger" | "env">',
      ),
  ]);
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

function wireNotificationRegistry(source: string): WiringEdit {
  if (source.includes("mailChannel")) return { path: "", source, status: "present" };
  const next = chain(source, [
    (input) =>
      insertBefore(
        input,
        'import { databaseChannel } from "./database.ts";',
        'import { mailChannel } from "../../mail/channel.ts";',
      ),
    (input) =>
      replaceOnce(
        input,
        '.register("database", databaseChannel);',
        '.register("database", databaseChannel).register("mail", mailChannel);',
      ),
  ]);
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

/** Registers the Better Auth organization plugin in the auth composition root. */
function wireAuthPlugin(source: string): WiringEdit {
  if (source.includes("createOrganizationPlugin")) return { path: "", source, status: "present" };
  const next = chain(source, [
    (input) =>
      insertAfter(
        input,
        'import { drizzleAdapter } from "better-auth/adapters/drizzle";',
        'import { createOrganizationPlugin } from "../organizations/plugin.ts";',
      ),
    (input) => insertBefore(input, "    emailAndPassword: {", "    plugins: [createOrganizationPlugin()],"),
  ]);
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

/** Adds the organization tables to the drizzle adapter schema map the plugin is addressed by. */
function wireAuthSchema(source: string): WiringEdit {
  if (source.includes("organization: organizations")) return { path: "", source, status: "present" };
  const next = chain(source, [
    (input) =>
      replaceOnce(
        input,
        'import { accounts, sessions, users, verifications } from "./schema.ts";',
        'import { invitations, members, organizations } from "../organizations/schema.ts";\nimport { accounts, sessions, users, verifications } from "./schema.ts";',
      ),
    (input) =>
      replaceOnce(
        input,
        "schema: { user: users, session: sessions, account: accounts, verification: verifications },",
        [
          "schema: {",
          "        user: users,",
          "        session: sessions,",
          "        account: accounts,",
          "        verification: verifications,",
          "        organization: organizations,",
          "        member: members,",
          "        invitation: invitations,",
          "      },",
        ].join("\n"),
      ),
  ]);
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

/** Adds the plugin's `activeOrganizationId` to the sessions table. */
function wireSessionField(source: string): WiringEdit {
  if (source.includes("activeOrganizationId")) return { path: "", source, status: "present" };
  const next = insertAfter(
    source,
    '    userAgent: text("user_agent"),',
    '    activeOrganizationId: uuid("active_organization_id"),',
  );
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

/** Exports the plugin tables (and their relations) through the database schema barrel. */
function wireSchemaExport(source: string): WiringEdit {
  if (source.includes("features/organizations/schema.ts")) return { path: "", source, status: "present" };
  const next = insertAfter(
    source,
    'export { accounts, sessions, users, verifications } from "../features/identity/schema.ts";',
    'export { invitationRelations, invitations, memberRelations, members, organizationRelations, organizations } from "../features/organizations/schema.ts";',
  );
  return { path: "", source: next ?? source, status: next === undefined ? "skipped" : "added" };
}

const EDITORS: Record<InfraWiringOp, readonly Editor[]> = {
  context: [{ path: "apps/server/bootstrap/context.ts", apply: wireContext }],
  bootstrap: [{ path: "apps/server/bootstrap/bootstrap.ts", apply: wireBootstrap }],
  cloudflare: [{ path: "apps/server/bootstrap/cloudflare-context.ts", apply: wireCloudflare }],
  jobs: [{ path: "apps/server/features/jobs.ts", apply: wireJobs }],
  notifications: [
    { path: "apps/server/features/notifications/types.ts", apply: wireNotificationTypes },
    { path: "apps/server/features/notifications/channels/registry.ts", apply: wireNotificationRegistry },
  ],
  "auth-plugin": [{ path: "apps/server/features/identity/auth.ts", apply: wireAuthPlugin }],
  "auth-schema": [{ path: "apps/server/features/identity/auth.ts", apply: wireAuthSchema }],
  "session-field": [{ path: "apps/server/features/identity/schema.ts", apply: wireSessionField }],
  "schema-export": [{ path: "apps/server/database/schema.ts", apply: wireSchemaExport }],
};

/**
 * Applies the manifest's wiring operations; nothing is written here. Operations are composed per
 * file so two operations on one file (auth-plugin + auth-schema) do not overwrite each other; a
 * missing anchor marks that path `skipped` and the installer aborts before writing anything.
 */
export async function planInfraWiring(root: string, manifest: InfraFeatureManifest): Promise<WiringEdit[]> {
  const order: string[] = [];
  const state = new Map<string, { source: string; status: "added" | "present" | "skipped" }>();
  for (const op of manifest.wiring) {
    for (const editor of EDITORS[op]) {
      let entry = state.get(editor.path);
      if (!entry) {
        entry = { source: await Bun.file(resolve(root, editor.path)).text(), status: "present" };
        order.push(editor.path);
        state.set(editor.path, entry);
      }
      if (entry.status === "skipped") continue;
      const result = editor.apply(entry.source);
      if (result.status === "skipped") {
        entry.status = "skipped";
        continue;
      }
      entry.source = result.source;
      if (result.status === "added") entry.status = "added";
    }
  }
  return order.map((path) => {
    const entry = state.get(path);
    if (!entry) throw new Error(`wiring lost its edit for ${path}`);
    return { path, source: entry.source, status: entry.status };
  });
}
