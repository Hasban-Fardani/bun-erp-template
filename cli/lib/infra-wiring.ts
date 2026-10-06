import { resolve } from "node:path";
import type { InfraFeatureManifest, InfraWiringOp } from "./feature-catalog.ts";

/**
 * Installer wiring for `kind: "infra"` features. Each operation edits one fixed core file with a
 * strict anchor: a missing anchor returns `skipped` and the install aborts before writing anything,
 * so a half-wired composition root is impossible. The implementations are the mail feature's
 * wiring; a second infra feature adds its own operations here and to INFRA_WIRING_OPS.
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

const EDITORS: Record<InfraWiringOp, readonly Editor[]> = {
  context: [{ path: "apps/server/bootstrap/context.ts", apply: wireContext }],
  bootstrap: [{ path: "apps/server/bootstrap/bootstrap.ts", apply: wireBootstrap }],
  cloudflare: [{ path: "apps/server/bootstrap/cloudflare-context.ts", apply: wireCloudflare }],
  jobs: [{ path: "apps/server/features/jobs.ts", apply: wireJobs }],
  notifications: [
    { path: "apps/server/features/notifications/types.ts", apply: wireNotificationTypes },
    { path: "apps/server/features/notifications/channels/registry.ts", apply: wireNotificationRegistry },
  ],
};

/** Applies the manifest's wiring operations; nothing is written here. */
export async function planInfraWiring(root: string, manifest: InfraFeatureManifest): Promise<WiringEdit[]> {
  const edits: WiringEdit[] = [];
  for (const op of manifest.wiring) {
    for (const editor of EDITORS[op]) {
      const source = await Bun.file(resolve(root, editor.path)).text();
      edits.push({ ...editor.apply(source), path: editor.path });
    }
  }
  return edits;
}
