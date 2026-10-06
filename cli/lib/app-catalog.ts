import { resolve } from "node:path";
import { formatScaffold } from "./scaffold.ts";
import { registerWorkspace } from "./workspace-apps.ts";

export type CatalogAppKind = "server" | "web" | "mobile";

export const CATALOG_APP_KINDS: readonly CatalogAppKind[] = ["server", "web", "mobile"];

export function isCatalogAppKind(value: string): value is CatalogAppKind {
  return (CATALOG_APP_KINDS as readonly string[]).includes(value);
}

const SERVER_DEPENDENCY = "@bun-erp/server";
/** Detached rpc variants carry this marker; a re-fit only overwrites a marked file. */
const DETACHED_MARKER = "detached-shell";
/** Web tests that compile or run against the server app; they only exist in attached mode. */
const SERVER_COUPLED_TESTS = ["tests/rpc-types.ts", "tests/unit/identity-validation.test.ts"];

/**
 * Q30: web/mobile bind the server's typed Hono contract when a server app exists, and ship a
 * detached stub with no `@bun-erp/server` dependency when it does not. A later `bun erp init`
 * that adds the server re-fits the real client.
 */
async function synchronizeServerContract(
  root: string,
  dir: string,
  kind: CatalogAppKind,
  hasServer: boolean,
): Promise<void> {
  if (kind === "server") return;
  const catalog = resolve(root, "templates/apps", kind);
  const rpcPath = resolve(root, dir, "src/lib/rpc.ts");
  const detachedPath = resolve(root, dir, "src/lib/rpc-detached.ts");
  const current = (await Bun.file(rpcPath).exists()) ? await Bun.file(rpcPath).text() : "";
  const detached = current.includes(DETACHED_MARKER);

  if (hasServer) {
    // Re-fit a detached shell (or a fresh catalog copy) to the real typed client.
    if (detached || current.length === 0) {
      await Bun.write(rpcPath, await Bun.file(resolve(catalog, "src/lib/rpc.ts")).text());
      if (kind === "web") {
        for (const relative of SERVER_COUPLED_TESTS) {
          const testPath = resolve(root, dir, relative);
          if (!(await Bun.file(testPath).exists())) {
            await Bun.write(testPath, await Bun.file(resolve(catalog, relative)).text());
          }
        }
      }
    }
    if (await Bun.file(detachedPath).exists()) await Bun.$`rm -f ${detachedPath}`.quiet();
  } else if (!detached) {
    await Bun.write(rpcPath, await Bun.file(resolve(catalog, "src/lib/rpc-detached.ts")).text());
    if (await Bun.file(detachedPath).exists()) await Bun.$`rm -f ${detachedPath}`.quiet();
    if (kind === "web") {
      for (const relative of SERVER_COUPLED_TESTS) {
        const testPath = resolve(root, dir, relative);
        if (await Bun.file(testPath).exists()) await Bun.$`rm -f ${testPath}`.quiet();
      }
    }
  }

  const manifestPath = resolve(root, dir, "package.json");
  const manifest = (await Bun.file(manifestPath).json()) as { devDependencies?: Record<string, string> };
  const devDependencies = { ...(manifest.devDependencies ?? {}) };
  if (hasServer) devDependencies[SERVER_DEPENDENCY] = "workspace:*";
  else delete devDependencies[SERVER_DEPENDENCY];
  manifest.devDependencies = devDependencies;
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await formatScaffold([`${dir}/package.json`]);
}

/**
 * Copies `templates/apps/<kind>` into `apps/<name>`, renames the package, registers the workspace,
 * and binds or detaches the server contract. `bun erp init` and `bun erp apps:create` share this
 * path; an existing app is kept and only its server contract is synchronized.
 */
export async function installCatalogApp(
  root: string,
  options: { name: string; kind: CatalogAppKind; hasServer: boolean },
): Promise<{ dir: string; created: boolean }> {
  const { name, kind, hasServer } = options;
  const dir = `apps/${name}`;
  const destination = resolve(root, dir);
  const appManifestPath = resolve(destination, "package.json");
  if (await Bun.file(appManifestPath).exists()) {
    await synchronizeServerContract(root, dir, kind, hasServer);
    return { dir, created: false };
  }

  const catalog = resolve(root, "templates/apps", kind);
  if (!(await Bun.file(resolve(catalog, "package.json")).exists())) {
    throw new Error(`No ${kind} app catalog at templates/apps/${kind}. Add it or create the app manually.`);
  }

  await Bun.$`mkdir -p ${destination}`.quiet();
  await Bun.$`cp -R ${catalog}/. ${destination}/`.quiet();
  await Bun.$`rm -rf ${destination}/node_modules ${destination}/dist ${destination}/www ${destination}/.wrangler ${destination}/.tanstack`.quiet();

  const rootManifest = (await Bun.file(resolve(root, "package.json")).json()) as { version?: string };
  const appManifest = (await Bun.file(appManifestPath).json()) as { name?: string; version?: string };
  appManifest.name = `@bun-erp/${name}`;
  appManifest.version = rootManifest.version ?? "0.1.0";
  await Bun.write(appManifestPath, `${JSON.stringify(appManifest, null, 2)}\n`);

  await synchronizeServerContract(root, dir, kind, hasServer);

  const rootManifestPath = resolve(root, "package.json");
  const registered = registerWorkspace(await Bun.file(rootManifestPath).text(), dir);
  if (registered.status === "added") await Bun.write(rootManifestPath, registered.source);
  return { dir, created: true };
}
