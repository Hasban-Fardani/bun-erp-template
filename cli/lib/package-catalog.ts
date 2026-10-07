import { resolve } from "node:path";
import { fileIndex } from "./file-index.ts";

/**
 * Opt-in package catalog: `templates/packages/<name>/` waits until a deployment needs it.
 * Shared by `packages:install` and `features:install`, which installs the catalog packages a
 * feature declares in its manifest before copying the feature itself.
 */

export const PACKAGE_CATALOG_DIR = "templates/packages";
export const PACKAGES_DIR = "packages";

/** Catalog packages are detected by their manifest, because Bun.Glob matches files, not directories. */
export async function catalogPackageNames(root: string): Promise<string[]> {
  return (await fileIndex(root).files("templates/packages/*/package.json"))
    .map((file) => file.split("/")[2])
    .filter((name): name is string => Boolean(name))
    .sort();
}

export async function installedPackageNames(root: string): Promise<string[]> {
  return (await fileIndex(root).files("packages/*/package.json"))
    .map((file) => file.split("/")[1])
    .filter((name): name is string => Boolean(name))
    .sort();
}

/**
 * Copies one catalog package into `packages/<name>` and registers it in the root workspaces.
 * The caller decides when to run `bun install`, so a feature can add its app dependency first
 * and install once. An already installed package is left untouched.
 */
export async function copyCatalogPackage(root: string, name: string, options: { from?: string } = {}): Promise<string> {
  const destination = resolve(root, PACKAGES_DIR, name);
  if (await Bun.file(resolve(destination, "package.json")).exists()) return destination;

  const from = options.from;
  const clone = from && /^(https?:\/\/|git@)/.test(from) ? `/tmp/erp-package-${crypto.randomUUID()}` : undefined;
  if (clone && from) await Bun.$`git clone --depth 1 ${from} ${clone}`.quiet();
  const sourceRoot = clone ?? (from ? resolve(root, from) : resolve(root, PACKAGE_CATALOG_DIR, name));
  if (!(await Bun.file(resolve(sourceRoot, "package.json")).exists())) {
    const available = await catalogPackageNames(root);
    throw new Error(
      `No package "${name}" in ${PACKAGE_CATALOG_DIR} or at ${sourceRoot}.` +
        (available.length > 0 ? ` Available: ${available.join(", ")}` : " The catalog is empty."),
    );
  }

  await Bun.$`mkdir -p ${destination}`.quiet();
  await Bun.$`cp -R ${sourceRoot}/. ${destination}/`.quiet();
  await Bun.$`rm -rf ${destination}/node_modules ${destination}/dist`.quiet();
  if (clone) await Bun.$`rm -rf ${clone}`.quiet();

  await registerWorkspace(root, name);
  return destination;
}

/** Adds `packages/<name>` to the root workspaces; returns false when it is already registered. */
export async function registerWorkspace(root: string, name: string): Promise<boolean> {
  const manifestPath = resolve(root, "package.json");
  const manifest = (await Bun.file(manifestPath).json()) as { workspaces?: string[] };
  const workspaces = manifest.workspaces ?? [];
  const entry = `${PACKAGES_DIR}/${name}`;
  if (workspaces.includes(entry)) return false;
  manifest.workspaces = [...workspaces, entry];
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return true;
}

/** Adds a workspace dependency to an app manifest; returns false when it is already declared. */
export async function ensureWorkspaceDependency(
  root: string,
  manifestRelativePath: string,
  packageName: string,
): Promise<boolean> {
  const manifestPath = resolve(root, manifestRelativePath);
  const manifest = (await Bun.file(manifestPath).json()) as { dependencies?: Record<string, string> };
  const dependencies = manifest.dependencies ?? {};
  if (dependencies[packageName]) return false;
  dependencies[packageName] = "workspace:*";
  manifest.dependencies = dependencies;
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return true;
}
