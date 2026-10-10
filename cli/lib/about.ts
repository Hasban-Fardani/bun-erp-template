import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { collectDbSchema } from "./db-schema.ts";
import { installedFeatureNames } from "./feature-catalog.ts";
import { fileIndex } from "./file-index.ts";
import { GATE_CATALOG } from "./gates.ts";
import { installedPackageNames } from "./package-catalog.ts";
import { collectRoutes } from "./route-table.ts";

/**
 * Project introspection behind `bun loom about` and the MCP `app-info` tool. Every field is read
 * from the working tree, the installed catalog or a bounded local probe; nothing is written and no
 * app server is started.
 */

export type AboutApp = { name: string; packageName: string; version: string };

export type AboutReport = {
  bun: { version: string; pinned: string };
  typescriptVersion: string;
  apps: AboutApp[];
  packages: string[];
  features: string[];
  migrations: number;
  tables: number;
  routes: number;
  gates: number;
  database: { configured: boolean; reachable: boolean; detail: string };
  codegraph: { indexed: boolean; files: number; detail: string };
};

async function rootManifest(root: string): Promise<{
  engines?: { bun?: string };
  devDependencies?: Record<string, string>;
}> {
  return (await Bun.file(resolve(root, "package.json")).json()) as {
    engines?: { bun?: string };
    devDependencies?: Record<string, string>;
  };
}

async function installedApps(root: string): Promise<AboutApp[]> {
  const names = (await fileIndex(root).files("apps/*/package.json"))
    .map((file) => file.split("/")[1])
    .filter((name): name is string => Boolean(name))
    .sort();
  const apps: AboutApp[] = [];
  for (const name of names) {
    const manifest = (await Bun.file(resolve(root, "apps", name, "package.json")).json()) as {
      name?: string;
      version?: string;
    };
    apps.push({ name, packageName: manifest.name ?? name, version: manifest.version ?? "0.0.0" });
  }
  return apps;
}

async function migrationCount(root: string): Promise<number> {
  return (await fileIndex(root).files("apps/server/database/migrations/*.ts")).length;
}

/** TCP reachability only: no credentials are sent and no query runs, so the probe is safe anywhere. */
async function probeDatabase(url: string | undefined): Promise<AboutReport["database"]> {
  if (!url || url.trim().length === 0)
    return { configured: false, reachable: false, detail: "DATABASE_URL is not set" };
  let hostname: string;
  let port: number;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    port = Number(parsed.port || 5432);
  } catch {
    return { configured: true, reachable: false, detail: "DATABASE_URL is not a valid URL" };
  }
  try {
    const connecting = Bun.connect({ hostname, port, socket: { data() {}, open() {}, close() {}, error() {} } });
    const socket = await Promise.race([connecting, Bun.sleep(1500).then(() => null)]);
    if (!socket) {
      // The race may leave the connection pending; swallow a late rejection so it never surfaces.
      void connecting.catch(() => undefined);
      return { configured: true, reachable: false, detail: `timed out connecting to ${hostname}:${port}` };
    }
    socket.end();
    return { configured: true, reachable: true, detail: `tcp ${hostname}:${port}` };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function codegraphState(root: string): Promise<AboutReport["codegraph"]> {
  const indexPath = resolve(root, ".codegraph/codegraph.db");
  if (!(await Bun.file(indexPath).exists())) {
    return { indexed: false, files: 0, detail: "missing .codegraph/codegraph.db; run bun loom init" };
  }
  try {
    const database = new Database(indexPath);
    try {
      const rows = database.query<{ count: number }, []>("SELECT count(*) AS count FROM files").all();
      const files = rows[0]?.count ?? 0;
      return { indexed: true, files, detail: `${files} files indexed` };
    } finally {
      database.close();
    }
  } catch (error) {
    return {
      indexed: false,
      files: 0,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectAbout(root: string): Promise<AboutReport> {
  const manifest = await rootManifest(root);
  const [apps, packages, features, migrations, tables, routes, database, codegraph] = await Promise.all([
    installedApps(root),
    installedPackageNames(root),
    installedFeatureNames(root),
    migrationCount(root),
    collectDbSchema(root),
    collectRoutes(root),
    probeDatabase(process.env.DATABASE_URL),
    codegraphState(root),
  ]);
  return {
    bun: { version: Bun.version, pinned: manifest.engines?.bun ?? "unknown" },
    typescriptVersion: (manifest.devDependencies?.typescript ?? "unknown").replace(/^[~^]/, ""),
    apps,
    packages,
    features,
    migrations,
    tables: tables.length,
    routes: routes.length,
    // The two extra checks are biome and tsc; the catalog gates are the named entries.
    gates: GATE_CATALOG.length + 2,
    database,
    codegraph,
  };
}

/** One readable screen; long lists collapse to a count plus names. */
export function formatAbout(report: AboutReport): string {
  const list = (values: readonly string[]) => (values.length > 0 ? values.join(", ") : "none");
  const apps = report.apps.map((app) => `${app.name} (${app.packageName} ${app.version})`);
  const lines = [
    "loom project overview",
    "",
    `  Runtime      Bun ${report.bun.version} (pinned ${report.bun.pinned}) · TypeScript ${report.typescriptVersion}`,
    `  Apps         ${list(apps)}`,
    `  Packages     ${list(report.packages)}`,
    `  Features     ${list(report.features)}`,
    `  Migrations   ${report.migrations} module(s) · ${report.tables} table(s)`,
    `  Routes       ${report.routes} across the installed server app`,
    `  Database     ${report.database.reachable ? "reachable" : "unreachable"} — ${report.database.detail}`,
    `  Gates        ${report.gates} checks (${GATE_CATALOG.length} catalog gates + biome + types)`,
    `  CodeGraph    ${report.codegraph.indexed ? "indexed" : "not indexed"} — ${report.codegraph.detail}`,
  ];
  return `${lines.join("\n")}\n`;
}
