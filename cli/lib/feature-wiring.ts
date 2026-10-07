import { resolve } from "node:path";
import type { NavOverride } from "./scaffolding.ts";
import { addAuditEntity, addI18nKeys, addNavItem, addRouteMount, addStatementResource } from "./scaffolding.ts";
import type { WiringEdit } from "./wiring.ts";

/**
 * Plans the core-file wiring every feature needs: permissions, audit, route mount, sidebar entry
 * and both locale catalogs. Nothing is written here — `make:feature` and `features:install` both
 * compute the edits first and abort on a `skipped` result, so a missing anchor cannot leave a
 * half-wired feature behind.
 */

const WIRING_FILES = {
  statements: "apps/server/features/rbac/statements.ts",
  audit: "apps/server/features/audit/redact.ts",
  routes: "apps/server/routes/api.ts",
  nav: "apps/web/src/config/navigation.ts",
  enUS: "packages/i18n/src/utils/messages/en-US.ts",
  idID: "packages/i18n/src/utils/messages/id-ID.ts",
} as const;

export type FeatureWiringOptions = {
  /** Server registration (permissions, audit, route mount); omit for a web-only feature. */
  server?: { resource: string; auditEntity?: string; auditFields?: readonly string[] };
  nav?: NavOverride;
  i18nKeys?: Record<"en-US" | "id-ID", Record<string, string>>;
};

export async function planFeatureWiring(
  root: string,
  feature: { name: string; camel: string },
  options: FeatureWiringOptions = {},
): Promise<WiringEdit[]> {
  const read = (path: string) => Bun.file(resolve(root, path)).text();
  const edits: WiringEdit[] = [];

  // A web feature owns presentation only: its permissions, audit and API are already core.
  if (options.server) {
    const statements = addStatementResource(await read(WIRING_FILES.statements), options.server.resource);
    edits.push({ path: WIRING_FILES.statements, ...statements });

    const audit = addAuditEntity(
      await read(WIRING_FILES.audit),
      options.server.auditEntity ?? options.server.resource,
      options.server.auditFields,
    );
    edits.push({ path: WIRING_FILES.audit, ...audit });

    const routes = addRouteMount(await read(WIRING_FILES.routes), feature);
    edits.push({ path: WIRING_FILES.routes, ...routes });
  }

  const nav = addNavItem(await read(WIRING_FILES.nav), feature, options.nav);
  edits.push({ path: WIRING_FILES.nav, ...nav });

  const en = addI18nKeys(await read(WIRING_FILES.enUS), feature, "en-US", options.i18nKeys?.["en-US"]);
  edits.push({ path: WIRING_FILES.enUS, ...en });

  const id = addI18nKeys(await read(WIRING_FILES.idID), feature, "id-ID", options.i18nKeys?.["id-ID"]);
  edits.push({ path: WIRING_FILES.idID, ...id });

  return edits;
}
