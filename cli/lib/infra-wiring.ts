import { resolve } from "node:path";
import type { InfraFeatureManifest, InfraWiringOp } from "./feature-catalog.ts";
import type { WiringEdit } from "./wiring.ts";

/**
 * Installer wiring for `kind: "infra"` features. Each operation edits one fixed core file with a
 * strict anchor: a missing anchor returns `skipped` and the install aborts before writing anything,
 * so a half-wired composition root is impossible. Mail wires the composition root; organizations
 * registers the Better Auth organization plugin and its tables. Several operations may target one
 * file (organizations edits `identity/auth.ts` twice), so edits are composed per path in manifest
 * order instead of each operation overwriting the previous result.
 *
 * Presence is structural: every editor declares the full set of markers its completed edit leaves
 * behind. All markers present means the edit is already applied; none present means the file is
 * untouched and the chain may run; *some* present means a half-wired file, which fails loudly
 * instead of being read as "present" because one symbol happens to exist.
 */

type ApplyResult = { source: string; status: "added" | "present" | "skipped"; reason?: string };
type Editor = { path: string; markers: readonly string[]; apply: (source: string) => ApplyResult };

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

/** A replacer function keeps `$&`/`$1` in the replacement literal, not a capture reference. */
function replaceOnce(source: string, anchor: string, replacement: string): string | undefined {
  if (!source.includes(anchor)) return undefined;
  return source.replace(anchor, () => replacement);
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

function wired(next: string | undefined, source: string, reason: string): ApplyResult {
  if (next === undefined) return { source, status: "skipped", reason };
  return { source: next, status: next === source ? "present" : "added" };
}

function wireContext(source: string): ApplyResult {
  const next = chain(source, [
    (input) =>
      insertBefore(
        input,
        'import type { Env } from "../config/index.ts";',
        `import type { Mailer } from "${MAIL_PACKAGE}";`,
      ),
    (input) => insertAfter(input, "  auth: Auth;", "  mail: Mailer;"),
  ]);
  return wired(next, source, "the context.ts anchors (Env import and auth field) are missing");
}

function wireBootstrap(source: string): ApplyResult {
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
  return wired(
    next,
    source,
    "the bootstrap.ts anchors (createAuth import, auth creation or context return) are missing",
  );
}

function wireCloudflare(source: string): ApplyResult {
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
  return wired(
    next,
    source,
    "the cloudflare-context.ts anchors (createAuth import, logger or context return) are missing",
  );
}

function wireJobs(source: string): ApplyResult {
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
  return wired(
    next,
    source,
    "the features/jobs.ts anchors (JobRegistry import, context type or registry creation) are missing",
  );
}

function wireNotificationTypes(source: string): ApplyResult {
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
  return wired(next, source, "the notifications/types.ts anchors (channel list or context type) are missing");
}

function wireNotificationRegistry(source: string): ApplyResult {
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
  return wired(next, source, "the channels/registry.ts anchors (database import or registration) are missing");
}

/** Registers the Better Auth organization plugin in the auth composition root. */
function wireAuthPlugin(source: string): ApplyResult {
  const next = chain(source, [
    (input) =>
      insertAfter(
        input,
        'import { drizzleAdapter } from "better-auth/adapters/drizzle";',
        'import { createOrganizationPlugin } from "../organizations/plugin.ts";',
      ),
    (input) => insertBefore(input, "    emailAndPassword: {", "    plugins: [createOrganizationPlugin()],"),
  ]);
  return wired(
    next,
    source,
    "the identity/auth.ts plugin anchors (drizzleAdapter import or emailAndPassword) are missing",
  );
}

/** Adds the organization tables to the drizzle adapter schema map the plugin is addressed by. */
function wireAuthSchema(source: string): ApplyResult {
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
  return wired(
    next,
    source,
    "the identity/auth.ts schema anchors (identity schema import or adapter schema map) are missing",
  );
}

/** Adds the plugin's `activeOrganizationId` to the sessions table. */
function wireSessionField(source: string): ApplyResult {
  const next = insertAfter(
    source,
    '    userAgent: text("user_agent"),',
    '    activeOrganizationId: uuid("active_organization_id"),',
  );
  return wired(next, source, "the identity/schema.ts userAgent anchor is missing");
}

/** Exports the plugin tables (and their relations) through the database schema barrel. */
function wireSchemaExport(source: string): ApplyResult {
  const next = insertAfter(
    source,
    'export { accounts, sessions, users, verifications } from "../features/identity/schema.ts";',
    'export { invitationRelations, invitations, memberRelations, members, organizationRelations, organizations } from "../features/organizations/schema.ts";',
  );
  return wired(next, source, "the database/schema.ts identity export anchor is missing");
}

const EDITORS: Record<InfraWiringOp, readonly Editor[]> = {
  context: [
    {
      path: "apps/server/bootstrap/context.ts",
      markers: [`import type { Mailer } from "${MAIL_PACKAGE}";`, "  mail: Mailer;"],
      apply: wireContext,
    },
  ],
  bootstrap: [
    {
      path: "apps/server/bootstrap/bootstrap.ts",
      markers: [
        'import { createAppMailer } from "../features/mail/wiring.ts";',
        "  const mail = createAppMailer(env, logger, db);",
        "return { env, db, logger, auth, mail, storage, close };",
      ],
      apply: wireBootstrap,
    },
  ],
  cloudflare: [
    {
      path: "apps/server/bootstrap/cloudflare-context.ts",
      markers: [
        'import { createAppMailer } from "../features/mail/wiring.ts";',
        "  const mail = createAppMailer(env, logger, db);",
        "return { env, db, logger, mail, storage, close };",
      ],
      apply: wireCloudflare,
    },
  ],
  jobs: [
    {
      path: "apps/server/features/jobs.ts",
      markers: [
        'import { registerMailJobs } from "./mail/wiring.ts";',
        'ctx: Pick<AppContext, "env" | "db" | "logger" | "mail">',
        "  registerMailJobs(registry, ctx.mail);",
      ],
      apply: wireJobs,
    },
  ],
  notifications: [
    {
      path: "apps/server/features/notifications/types.ts",
      markers: [
        'export const NOTIFICATION_CHANNELS = ["database", "mail"] as const;',
        'Pick<AppContext, "db" | "mail" | "logger" | "env">',
      ],
      apply: wireNotificationTypes,
    },
    {
      path: "apps/server/features/notifications/channels/registry.ts",
      markers: ['import { mailChannel } from "../../mail/channel.ts";', '.register("mail", mailChannel);'],
      apply: wireNotificationRegistry,
    },
  ],
  "auth-plugin": [
    {
      path: "apps/server/features/identity/auth.ts",
      markers: [
        'import { createOrganizationPlugin } from "../organizations/plugin.ts";',
        "plugins: [createOrganizationPlugin()],",
      ],
      apply: wireAuthPlugin,
    },
  ],
  "auth-schema": [
    {
      path: "apps/server/features/identity/auth.ts",
      markers: [
        'import { invitations, members, organizations } from "../organizations/schema.ts";',
        "organization: organizations,",
        "member: members,",
        "invitation: invitations,",
      ],
      apply: wireAuthSchema,
    },
  ],
  "session-field": [
    {
      path: "apps/server/features/identity/schema.ts",
      markers: ['activeOrganizationId: uuid("active_organization_id"),'],
      apply: wireSessionField,
    },
  ],
  "schema-export": [
    {
      path: "apps/server/database/schema.ts",
      markers: [
        'export { invitationRelations, invitations, memberRelations, members, organizationRelations, organizations } from "../features/organizations/schema.ts";',
      ],
      apply: wireSchemaExport,
    },
  ],
};

/**
 * Applies the manifest's wiring operations; nothing is written here. Operations are composed per
 * file so two operations on one file (auth-plugin + auth-schema) do not overwrite each other; a
 * missing anchor marks that path `skipped` and the installer aborts before writing anything.
 */
export async function planInfraWiring(root: string, manifest: InfraFeatureManifest): Promise<WiringEdit[]> {
  const order: string[] = [];
  const state = new Map<string, WiringEdit>();
  for (const op of manifest.wiring) {
    for (const editor of EDITORS[op]) {
      let entry = state.get(editor.path);
      if (!entry) {
        entry = { path: editor.path, source: await Bun.file(resolve(root, editor.path)).text(), status: "present" };
        order.push(editor.path);
        state.set(editor.path, entry);
      }
      if (entry.status === "skipped") continue;

      const present = editor.markers.filter((marker) => entry.source.includes(marker)).length;
      if (present === editor.markers.length) continue;
      if (present > 0) {
        entry.status = "skipped";
        entry.reason = `the file is half-wired: ${present} of ${editor.markers.length} expected edits are present; complete or revert them`;
        continue;
      }

      const result = editor.apply(entry.source);
      if (result.status === "skipped") {
        entry.status = "skipped";
        entry.reason = result.reason;
        continue;
      }
      entry.source = result.source;
      if (result.status === "added") entry.status = "added";
    }
  }
  return order.map((path) => {
    const entry = state.get(path);
    if (!entry) throw new Error(`wiring lost its edit for ${path}`);
    return entry;
  });
}
