import { resolve } from "node:path";

/**
 * Feature catalog: `templates/features/<name>/` holds everything `bun erp features:install`
 * copies into `apps/*`. The manifest is the single source of truth for wiring, so the command
 * never guesses a permission key or an i18n label.
 *
 * Three kinds exist:
 * - `server` (default): a full module — server files, tests, permission/audit/route wiring.
 * - `web`: presentation only — web files, a page wrapper, a design spec, navigation and i18n.
 *   Its API and permissions are already core (`identity`, `rbac`, `audit`).
 * - `infra`: server infrastructure that installs a catalog package and wires the composition
 *   root; no routes, permissions, audit, navigation or i18n.
 */

export type FeatureLocale = "en-US" | "id-ID";

export type FeatureKind = "server" | "web" | "infra";

/**
 * The wiring operations an infra manifest may name. The installer implements each one against a
 * fixed core file and fails the install when its anchor is missing, so the manifest can only
 * request wiring the installer knows how to perform.
 */
export const INFRA_WIRING_OPS = ["context", "bootstrap", "cloudflare", "jobs", "notifications"] as const;

export type InfraWiringOp = (typeof INFRA_WIRING_OPS)[number];

export type FeatureNav = { titleKey: string; url: string; icon: string; permission: string };

/** Files every catalog feature may ship, independent of its kind. */
export type FeatureFiles = {
  web: readonly string[];
  /**
   * Shared web helpers copied once into `apps/web/src/lib/` and skipped when already present.
   * Entries are catalog-root relative and must live under `_shared/`, e.g.
   * `_shared/web/use-table-state.ts`; the destination basename is preserved.
   */
  shared: readonly string[];
  page: string;
  /** Optional design-direction spec, copied to apps/web/design/<name>.json. */
  design?: string;
};

export type ServerFeatureManifest = {
  kind: "server";
  name: string;
  permissionResource: string;
  auditEntity: string;
  /** Snapshot allowlist for the audit entity; omitted = the generator's base columns. */
  auditFields?: readonly string[];
  /** Catalog packages the feature needs; the installer installs them first. */
  requires: readonly string[];
  nav: FeatureNav;
  i18nKeys: Record<FeatureLocale, Record<string, string>>;
  files: FeatureFiles & { server: readonly string[]; tests: readonly string[] };
  /** Optional forward-only migrations, numbered into apps/server/database/migrations/ on install. */
  migrations?: readonly string[];
};

export type WebFeatureManifest = {
  kind: "web";
  name: string;
  /** Catalog packages the feature needs; the installer installs them first. */
  requires: readonly string[];
  nav: FeatureNav;
  i18nKeys: Record<FeatureLocale, Record<string, string>>;
  files: FeatureFiles;
};

export type InfraFeatureManifest = {
  kind: "infra";
  name: string;
  /** Catalog packages the feature installs; an infra feature wires at least one. */
  requires: readonly string[];
  /** Named wiring operations; see INFRA_WIRING_OPS. */
  wiring: readonly InfraWiringOp[];
  files: { server: readonly string[]; tests: readonly string[] };
};

export type FeatureManifest = ServerFeatureManifest | WebFeatureManifest | InfraFeatureManifest;

export type PlannedFile = {
  source: string;
  destination: string;
  /** Shared helpers never overwrite a file that is already installed. */
  skipIfPresent?: boolean;
};

const CATALOG_DIR = "templates/features";
const SHARED_PREFIX = "_shared/";
const KEBAB = /^[a-z][a-z0-9-]{0,62}$/;
const PACKAGE_NAME = /^[a-z][a-z0-9-]*$/;

/** Catalog features are directories with a manifest; a directory alone is not a feature. */
export async function catalogFeatureNames(root: string): Promise<string[]> {
  try {
    return [...new Bun.Glob("*/feature.json").scanSync({ cwd: resolve(root, CATALOG_DIR) })]
      .map((file) => file.split("/")[0])
      .filter((name): name is string => Boolean(name))
      .sort();
  } catch {
    return [];
  }
}

/**
 * A catalog feature is installed once its kind-specific markers exist. A web feature never uses
 * the server module as a marker: its name may collide with a core feature (`audit`).
 */
export async function installedFeatureNames(root: string): Promise<string[]> {
  const names = await catalogFeatureNames(root);
  const installed: string[] = [];
  for (const name of names) {
    const manifest = await readFeatureManifest(root, name);
    if (manifest.kind === "server") {
      if (await Bun.file(resolve(root, `apps/server/features/${name}/feature.ts`)).exists()) installed.push(name);
      continue;
    }
    if (manifest.kind === "infra") {
      try {
        const serverFiles = [...new Bun.Glob(`${name}/**/*`).scanSync({ cwd: resolve(root, "apps/server/features") })];
        if (serverFiles.length > 0) installed.push(name);
      } catch {
        // An absent features directory means nothing is installed.
      }
      continue;
    }
    if (await Bun.file(resolve(root, `apps/web/src/pages/_authenticated/${name}.tsx`)).exists()) {
      installed.push(name);
      continue;
    }
    try {
      const webFiles = [...new Bun.Glob(`${name}/**/*`).scanSync({ cwd: resolve(root, "apps/web/src/features") })];
      if (webFiles.length > 0) installed.push(name);
    } catch {
      // apps/web/src/features is always present in the template; an absent directory means no web files.
    }
  }
  return installed;
}

export async function readFeatureManifest(root: string, name: string): Promise<FeatureManifest> {
  if (!KEBAB.test(name)) throw new Error(`Feature name must be kebab-case, e.g. reports: ${name}`);
  const catalog = resolve(root, CATALOG_DIR, name);
  const manifestPath = resolve(catalog, "feature.json");
  if (!(await Bun.file(manifestPath).exists())) {
    const available = await catalogFeatureNames(root);
    throw new Error(
      `No feature "${name}" in ${CATALOG_DIR}.` +
        (available.length > 0 ? ` Available: ${available.join(", ")}` : " The catalog is empty."),
    );
  }

  const manifest = validateFeatureManifest(await Bun.file(manifestPath).json(), name);
  for (const relative of manifestFiles(manifest)) {
    if (relative.includes("..") || relative.startsWith("/")) {
      throw new Error(`Feature "${name}" declares a path that escapes the catalog: ${relative}`);
    }
    const source = resolve(catalog, relative);
    if (!(await Bun.file(source).exists())) {
      throw new Error(`Feature "${name}" declares a missing file: ${relative}`);
    }
  }
  const sharedFiles = manifest.kind === "infra" ? [] : manifest.files.shared;
  for (const relative of sharedFiles) {
    if (relative.includes("..") || relative.startsWith("/") || !relative.startsWith(SHARED_PREFIX)) {
      throw new Error(
        `Feature "${name}" declares a shared path outside ${SHARED_PREFIX} in the feature catalog: ${relative}`,
      );
    }
    const source = resolve(root, CATALOG_DIR, relative);
    if (!(await Bun.file(source).exists())) {
      throw new Error(`Feature "${name}" declares a missing shared file: ${relative}`);
    }
  }
  return manifest;
}

/** Files relative to the feature's own catalog directory. */
function manifestFiles(manifest: FeatureManifest): string[] {
  if (manifest.kind === "infra") return [...manifest.files.server, ...manifest.files.tests];
  if (manifest.kind === "web") {
    return [...manifest.files.web, manifest.files.page, ...(manifest.files.design ? [manifest.files.design] : [])];
  }
  return [
    ...manifest.files.server,
    ...manifest.files.web,
    ...manifest.files.tests,
    manifest.files.page,
    ...(manifest.files.design ? [manifest.files.design] : []),
    ...(manifest.migrations ?? []),
  ];
}

/** Maps catalog-relative files onto their installed destinations under apps/*. */
export function planFeatureInstall(manifest: FeatureManifest): PlannedFile[] {
  const { name } = manifest;
  if (manifest.kind === "infra") {
    return [
      ...manifest.files.server.map((source) => ({
        source,
        destination: `apps/server/features/${name}/${source.slice("server/".length)}`,
      })),
      ...manifest.files.tests.map((source) => ({
        source,
        destination: `apps/server/tests/features/${name}/${source.slice("tests/".length)}`,
      })),
    ];
  }
  if (manifest.kind === "web") {
    return [
      ...manifest.files.web.map((source) => ({
        source,
        destination: `apps/web/src/features/${name}/${source.slice("web/".length)}`,
      })),
      ...manifest.files.shared.map((source) => ({
        source,
        destination: `apps/web/src/lib/${source.slice(SHARED_PREFIX.length).split("/").at(-1) ?? ""}`,
        skipIfPresent: true,
      })),
      { source: manifest.files.page, destination: `apps/web/src/pages/_authenticated/${name}.tsx` },
      ...(manifest.files.design
        ? [{ source: manifest.files.design, destination: `apps/web/design/${name}.json` }]
        : []),
    ];
  }
  return [
    ...manifest.files.server.map((source) => ({
      source,
      destination: `apps/server/features/${name}/${source.slice("server/".length)}`,
    })),
    ...manifest.files.web.map((source) => ({
      source,
      destination: `apps/web/src/features/${name}/${source.slice("web/".length)}`,
    })),
    ...manifest.files.shared.map((source) => ({
      source,
      destination: `apps/web/src/lib/${source.slice(SHARED_PREFIX.length).split("/").at(-1) ?? ""}`,
      skipIfPresent: true,
    })),
    ...manifest.files.tests.map((source) => ({
      source,
      destination: `apps/server/tests/features/${name}/${source.slice("tests/".length)}`,
    })),
    { source: manifest.files.page, destination: `apps/web/src/pages/_authenticated/${name}.tsx` },
    ...(manifest.files.design ? [{ source: manifest.files.design, destination: `apps/web/design/${name}.json` }] : []),
  ];
}

function validateFeatureManifest(raw: unknown, directoryName: string): FeatureManifest {
  const record = asRecord(raw, "feature.json must be a JSON object");
  const name = requiredString(record, "name");
  if (name !== directoryName) {
    throw new Error(`Feature name must match its directory: "${name}" in templates/features/${directoryName}`);
  }

  const kind = readKind(record);
  const requires = optionalStringArray(record, "requires") ?? [];
  for (const pkg of requires) {
    if (!PACKAGE_NAME.test(pkg)) throw new Error(`requires must list kebab-case catalog packages: ${pkg}`);
  }

  const filesRecord = asRecord(record.files, "files must be an object");
  if (kind === "infra") {
    for (const key of ["permissionResource", "auditEntity", "auditFields", "nav", "i18nKeys", "migrations"]) {
      if (record[key] !== undefined) throw new Error(`${key} is not part of an infra feature manifest`);
    }
    for (const key of ["web", "shared", "page", "design"]) {
      if (filesRecord[key] !== undefined) throw new Error(`files.${key} is not allowed in an infra feature manifest`);
    }
    if (requires.length === 0) throw new Error("an infra feature must require at least one catalog package");
    const wiring = stringArray(record, "wiring");
    const seen = new Set<string>();
    for (const op of wiring) {
      if (!(INFRA_WIRING_OPS as readonly string[]).includes(op)) {
        throw new Error(`wiring must name a known operation (${INFRA_WIRING_OPS.join(", ")}): ${op}`);
      }
      if (seen.has(op)) throw new Error(`wiring lists the same operation twice: ${op}`);
      seen.add(op);
    }
    const server = stringArray(filesRecord, "server");
    const tests = stringArray(filesRecord, "tests");
    if (!tests.some((file) => file.endsWith(".test.ts"))) throw new Error("files.tests must include a *.test.ts");
    for (const file of server)
      if (!file.startsWith("server/")) throw new Error(`server file must start with server/: ${file}`);
    for (const file of tests)
      if (!file.startsWith("tests/")) throw new Error(`test file must start with tests/: ${file}`);
    return {
      kind,
      name,
      requires,
      wiring: wiring as InfraWiringOp[],
      files: { server, tests },
    };
  }

  const navRecord = asRecord(record.nav, "nav must be an object");
  const nav: FeatureNav = {
    titleKey: requiredString(navRecord, "titleKey"),
    url: requiredString(navRecord, "url"),
    icon: requiredString(navRecord, "icon"),
    permission: requiredString(navRecord, "permission"),
  };
  if (!nav.url.startsWith("/")) throw new Error("nav.url must start with /");

  const keysRecord = asRecord(record.i18nKeys, "i18nKeys must be an object");
  const i18nKeys = {
    "en-US": localeKeys(keysRecord, "en-US"),
    "id-ID": localeKeys(keysRecord, "id-ID"),
  } satisfies Record<FeatureLocale, Record<string, string>>;

  const web = stringArray(filesRecord, "web");
  const shared = optionalStringArray(filesRecord, "shared") ?? [];
  const page = requiredString(filesRecord, "page");
  const design = filesRecord.design === undefined ? undefined : requiredString(filesRecord, "design");
  if (!page.startsWith("web/") || !page.endsWith(".tsx")) throw new Error("files.page must be a web/*.tsx wrapper");
  if (design && (!design.startsWith("web/design/") || !design.endsWith(".json"))) {
    throw new Error("files.design must be a web/design/*.json spec");
  }
  for (const file of web) if (!file.startsWith("web/")) throw new Error(`web file must start with web/: ${file}`);
  for (const file of shared) {
    if (!file.startsWith(SHARED_PREFIX) || !file.endsWith(".ts")) {
      throw new Error(`shared file must be a ${SHARED_PREFIX}*.ts helper: ${file}`);
    }
  }

  if (kind === "web") {
    for (const key of ["permissionResource", "auditEntity", "auditFields"]) {
      if (record[key] !== undefined) throw new Error(`${key} is not part of a web feature manifest`);
    }
    for (const key of ["server", "tests"]) {
      if (filesRecord[key] !== undefined) throw new Error(`files.${key} is not allowed in a web feature manifest`);
    }
    if (record.migrations !== undefined) throw new Error("migrations are not part of a web feature manifest");
    return {
      kind,
      name,
      requires,
      nav,
      i18nKeys,
      files: { web, shared, page, ...(design ? { design } : {}) },
    };
  }

  const permissionResource = requiredString(record, "permissionResource");
  const auditEntity = requiredString(record, "auditEntity");
  const auditFields = optionalStringArray(record, "auditFields");
  const server = stringArray(filesRecord, "server");
  const tests = stringArray(filesRecord, "tests");
  if (!server.some((file) => file.endsWith("/feature.ts"))) throw new Error("files.server must include feature.ts");
  if (!tests.some((file) => file.endsWith(".test.ts"))) throw new Error("files.tests must include a *.test.ts");
  for (const file of server)
    if (!file.startsWith("server/")) throw new Error(`server file must start with server/: ${file}`);
  for (const file of tests)
    if (!file.startsWith("tests/")) throw new Error(`test file must start with tests/: ${file}`);

  const migrations = optionalStringArray(record, "migrations") ?? [];
  for (const file of migrations)
    if (!file.startsWith("migrations/")) throw new Error(`migration must start with migrations/: ${file}`);

  return {
    kind,
    name,
    permissionResource,
    auditEntity,
    ...(auditFields ? { auditFields } : {}),
    requires,
    nav,
    i18nKeys,
    files: { server, web, shared, tests, page, ...(design ? { design } : {}) },
    ...(migrations.length > 0 ? { migrations } : {}),
  };
}

function readKind(record: Record<string, unknown>): FeatureKind {
  const value = record.kind;
  if (value === undefined) return "server";
  if (value === "server" || value === "web" || value === "infra") return value;
  throw new Error(`kind must be "server", "web", or "infra": ${String(value)}`);
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${key} must be a non-empty string`);
  return value;
}

function stringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${key} must be a non-empty array of strings`);
  }
  return value as string[];
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value as string[];
}

function localeKeys(record: Record<string, unknown>, locale: FeatureLocale): Record<string, string> {
  const entries = asRecord(record[locale], `i18nKeys.${locale} must be an object`);
  const keys: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value !== "string") throw new Error(`i18nKeys.${locale}.${key} must be a string`);
    keys[key] = value;
  }
  if (Object.keys(keys).length === 0) throw new Error(`i18nKeys.${locale} must not be empty`);
  return keys;
}
