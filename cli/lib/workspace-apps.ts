import { fileIndex } from "./file-index.ts";
import { toKebabName, type WiringResult } from "./scaffolding.ts";

/** Workspace apps are deployment units: discovered from the root manifest, never a second registry. */
export type WorkspaceApp = {
  dir: string;
  name: string;
  packageName: string;
  version: string;
  private: boolean;
  scripts: Record<string, string>;
  entry: string | null;
  port: number | null;
  portSource: "config" | "script" | "source" | null;
  buildDir: string | null;
  buildUpdatedAt: Date | null;
  testDir: string | null;
  testFiles: number;
};

const BUILD_DIRS = ["dist", "www", "build", ".output"];
const ENTRY_CANDIDATES = ["src/index.ts", "src/main.ts", "src/main.tsx", "server.ts", "index.ts"];
const DEFAULT_APP_PORT = 3001;

async function readJson<T>(path: string): Promise<T | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  return (await file.json()) as T;
}

export async function listWorkspaceApps(root: string): Promise<WorkspaceApp[]> {
  const manifest = await readJson<{ workspaces?: string[] }>(`${root}/package.json`);
  const dirs = (manifest?.workspaces ?? []).filter((entry) => entry.startsWith("apps/")).sort();
  const apps: WorkspaceApp[] = [];
  for (const dir of dirs) {
    const app = await readWorkspaceApp(root, dir.replace(/^apps\//, ""));
    if (app) apps.push(app);
  }
  return apps;
}

export async function readWorkspaceApp(root: string, selector: string): Promise<WorkspaceApp | undefined> {
  const manifest = await readJson<{ workspaces?: string[] }>(`${root}/package.json`);
  const dirs = (manifest?.workspaces ?? []).filter((entry) => entry.startsWith("apps/"));
  const wanted = selector.startsWith("apps/") ? selector : `apps/${selector}`;
  const dir = dirs.find((entry) => entry === wanted);
  if (!dir) return undefined;

  const appManifest = await readJson<{
    name?: string;
    version?: string;
    private?: boolean;
    main?: string;
    module?: string;
    scripts?: Record<string, string>;
  }>(`${root}/${dir}/package.json`);
  if (!appManifest) return undefined;

  const name = dir.replace(/^apps\//, "");
  const scripts = appManifest.scripts ?? {};
  const entry = appManifest.main ?? appManifest.module ?? (await firstExisting(`${root}/${dir}`, ENTRY_CANDIDATES));
  const port = await resolvePort(`${root}/${dir}`, scripts, entry);
  const build = await buildStatus(root, dir);
  const tests = await testStatus(root, dir);

  return {
    dir,
    name,
    packageName: appManifest.name ?? name,
    version: appManifest.version ?? "0.0.0",
    private: appManifest.private ?? false,
    scripts,
    entry,
    port: port?.value ?? null,
    portSource: port?.source ?? null,
    buildDir: build?.dir ?? null,
    buildUpdatedAt: build?.updatedAt ?? null,
    testDir: tests?.dir ?? null,
    testFiles: tests?.files ?? 0,
  };
}

async function firstExisting(base: string, candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await Bun.file(`${base}/${candidate}`).exists()) return candidate;
  }
  return null;
}

async function resolvePort(
  dir: string,
  scripts: Record<string, string>,
  entry: string | null,
): Promise<{ value: number; source: "config" | "script" | "source" } | undefined> {
  const vite = await Bun.file(`${dir}/vite.config.ts`)
    .text()
    .catch(() => "");
  const configPort = /server:\s*\{[^}]*?port:\s*(\d+)/.exec(vite)?.[1];
  if (configPort) return { value: Number(configPort), source: "config" };

  for (const script of Object.values(scripts)) {
    const scriptPort = /--port[= ](\d+)/.exec(script)?.[1];
    if (scriptPort) return { value: Number(scriptPort), source: "script" };
  }

  if (entry) {
    const source = await Bun.file(`${dir}/${entry}`).text();
    const sourcePort = /DEFAULT_PORT\s*=\s*(\d+)|PORT\s*\?\?\s*(\d+)/.exec(source);
    const value = sourcePort?.[1] ?? sourcePort?.[2];
    if (value) return { value: Number(value), source: "source" };
  }
  return undefined;
}

async function buildStatus(root: string, dir: string): Promise<{ dir: string; updatedAt: Date | null } | undefined> {
  const index = fileIndex(root);
  for (const candidate of BUILD_DIRS) {
    const files = await index.files(`${dir}/${candidate}/**/*`);
    if (files.length === 0) continue;
    let newest = 0;
    for (const file of files) {
      const modified = Bun.file(`${root}/${file}`).lastModified;
      if (modified > newest) newest = modified;
    }
    return { dir: candidate, updatedAt: newest > 0 ? new Date(newest) : null };
  }
  return undefined;
}

async function testStatus(root: string, dir: string): Promise<{ dir: string; files: number } | undefined> {
  const index = fileIndex(root);
  for (const candidate of ["tests", "test"]) {
    const files = await index.files(`${dir}/${candidate}/**/*.test.ts`);
    if (files.length > 0) return { dir: candidate, files: files.length };
  }
  return undefined;
}

/** A minimal Bun service app: runnable, testable, and version-aligned with the root release. */
export function renderAppScaffold(rawName: string, options: { version: string; port?: number }) {
  const name = toKebabName(rawName, "App");
  const dir = `apps/${name}`;
  const port = options.port ?? DEFAULT_APP_PORT;
  const manifest = {
    name: `@bun-erp/${name}`,
    version: options.version,
    private: true,
    type: "module",
    module: "src/index.ts",
    scripts: {
      dev: "bun --watch src/index.ts",
      start: "bun src/index.ts",
      lint: "bunx --bun biome check .",
      format: "bunx --bun biome format --write .",
      test: "bun test tests",
    },
  };
  const files = [
    { path: `${dir}/package.json`, contents: `${JSON.stringify(manifest, null, 2)}\n` },
    {
      path: `${dir}/tsconfig.json`,
      contents: `{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "types": ["bun"]
  },
  "include": ["./**/*.ts"]
}
`,
    },
    {
      path: `${dir}/src/index.ts`,
      contents: `const DEFAULT_PORT = ${port};

export function resolvePort(value = process.env.PORT): number {
  const port = Number(value ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(\`Invalid PORT: \${value}\`);
  return port;
}

if (import.meta.main) {
  const server = Bun.serve({
    port: resolvePort(),
    fetch() {
      return Response.json({ app: "${name}", status: "ok" });
    },
  });
  console.log(\`${name} listening on \${server.url}\`);
}
`,
    },
    {
      path: `${dir}/tests/${name}.test.ts`,
      contents: `import { expect, test } from "bun:test";
import { resolvePort } from "../src/index.ts";

test("resolvePort reads valid ports and rejects nonsense", () => {
  expect(resolvePort("4000")).toBe(4000);
  expect(() => resolvePort("nope")).toThrow(/Invalid PORT/);
});
`,
    },
    {
      path: `${dir}/README.md`,
      contents: `# ${name} app

Minimal Bun workspace app created by \`bun erp apps:create\`. See the
[development guide](../../docs/development.md) for the shared workflow.

    bun install
    bun run --cwd ${dir} dev

\`PORT\` selects the listening port (default ${port}). Run the app's own checks with
\`bun run --cwd ${dir} lint\` and \`bun run --cwd ${dir} test\`.
`,
    },
  ];
  return { name, dir, packageName: manifest.name, port, files };
}

/** Adds the new app to the root workspaces array; the monorepo has no second app registry. */
export function registerWorkspace(source: string, dir: string): WiringResult {
  const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^\\s*"${escaped}",?$`, "m").test(source)) return { source, status: "present" };

  // Apps lead the workspaces array. An empty template has no apps entry yet, so insert at the
  // array head instead of appending after a sibling that does not exist.
  const arrayStart = /"workspaces"\s*:\s*\[/.exec(source);
  if (!arrayStart) return { source, status: "skipped" };
  const end = arrayStart.index + arrayStart[0].length;
  return { source: `${source.slice(0, end)}\n    "${dir}",${source.slice(end)}`, status: "added" };
}
