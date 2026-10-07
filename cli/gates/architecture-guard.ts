import { dirname, join, normalize, relative, resolve } from "node:path";
import { type FileIndex, fileIndex } from "../lib/file-index.ts";
import { directoryExists } from "./exists.ts";

const LEVELS = ["atoms", "molecules", "organisms", "templates"];
// Shared data tables use TanStack's headless core; router, query and application form state stay app-owned.
const SHARED_TANSTACK = new Set(["@tanstack/react-table"]);

/**
 * Server features are the extraction boundary: another feature may import `features/<b>` only
 * through `features/<b>/index.ts`, so splitting one into a service means moving the folder and
 * repointing one entry instead of rewriting every deep import. The catalog feature modules under
 * `templates/features/<name>/server/**` are checked at their installed path, because their
 * relative imports are written for `apps/server/features/<name>/`.
 */
async function featureBoundaryFindings(root: string, index: FileIndex): Promise<string[]> {
  const findings: string[] = [];
  const entries: { file: string; virtualPath: string }[] = [];
  if (await directoryExists(`${root}/apps/server/features`)) {
    for (const file of await index.files("apps/server/features/**/*.ts")) entries.push({ file, virtualPath: file });
  } else {
    for (const file of await index.files("templates/apps/server/features/**/*.ts")) {
      entries.push({ file, virtualPath: file.replace("templates/apps/", "apps/") });
    }
  }
  for (const file of await index.files("templates/features/*/server/**/*.ts")) {
    const name = /^templates\/features\/([^/]+)\/server\//.exec(file)?.[1];
    if (!name) continue;
    entries.push({
      file,
      virtualPath: `apps/server/features/${name}/${file.slice(`templates/features/${name}/server/`.length)}`,
    });
  }

  for (const { file, virtualPath } of entries) {
    const code = await index.text(file);
    const imports = new Bun.Transpiler({ loader: "ts" }).scanImports(code).map(({ path }) => path);
    // Bun removes type-only imports, but a type-only deep import still crosses the boundary.
    for (const match of code.matchAll(/(?:import|export)\s+type\s+[^;]+?\s+from\s+["']([^"']+)["']/g)) {
      if (match[1]) imports.push(match[1]);
    }
    const origin = featureNameOf(virtualPath);
    for (const specifier of imports) {
      if (!specifier.startsWith(".")) continue;
      const resolved = normalize(join(dirname(virtualPath), specifier))
        .split("\\")
        .join("/");
      const target = featureNameOf(resolved);
      if (!target || target === origin) continue;
      const entry = `apps/server/features/${target}`;
      // `../rbac` and `../rbac/index.ts` both resolve to the public surface.
      if (resolved === entry || resolved === `${entry}/index.ts`) continue;
      findings.push(`${file}: FEATURE_BOUNDARY — ${specifier} bypasses features/${target}/index.ts`);
    }
  }
  return findings;
}

function featureNameOf(path: string): string | undefined {
  return /(?:^|\/)features\/([^/]+)/.exec(path)?.[1];
}

/** Shared presentation stays usable without either application's runtime. */
export async function checkArchitecture(root: string): Promise<string[]> {
  const findings: string[] = [];
  const index = fileIndex(root);
  const files: string[] = [];
  for (const dir of ["apps/web/src", "apps/mobile/src", "packages/ui/src"]) {
    // apps/mobile/src only exists after `bun erp apps:create <name> mobile`.
    if (!(await directoryExists(`${root}/${dir}`))) continue;
    files.push(...(await index.files(`${dir}/**/*.{ts,tsx}`)));
  }
  for (const file of files) {
    const code = await index.text(file);
    const imports = new Bun.Transpiler({ loader: "tsx" }).scanImports(code).map(({ path }) => path);
    // Bun removes type-only imports, so retain those boundaries during the source scan.
    for (const match of code.matchAll(/(?:import|export)\s+type\s+[^;]+?\s+from\s+["']([^"']+)["']/g)) {
      if (match[1]) imports.push(match[1]);
    }
    for (const specifier of imports) {
      const target = specifier.startsWith(".")
        ? relative(root, resolve(root, dirname(file), specifier))
        : specifier.startsWith("@bun-erp/ui/")
          ? specifier.replace("@bun-erp/ui/", "packages/ui/src/")
          : specifier;
      const shared = file.startsWith("packages/ui/src/");
      if (
        shared &&
        (/^(apps\/|@bun-erp\/(web|mobile|server)(\/|$)|hono(\/|$))/.test(target) ||
          (target.startsWith("@tanstack/") && !SHARED_TANSTACK.has(target)))
      )
        findings.push(`${file}: UI_APPLICATION_DEPENDENCY — ${specifier}`);
      if (file.startsWith("apps/mobile/src/") && /^(apps\/web\/|@bun-erp\/web(\/|$))/.test(target))
        findings.push(`${file}: MOBILE_WEB_SOURCE — ${specifier}`);
      if (file.startsWith("apps/web/src/") && /^(apps\/mobile\/|@bun-erp\/mobile(\/|$))/.test(target))
        findings.push(`${file}: WEB_MOBILE_SOURCE — ${specifier}`);
      if (!shared || !target.startsWith("packages/ui/src/")) continue;
      const originLevel = LEVELS.indexOf(file.split("/")[3] ?? "");
      const targetLevel = LEVELS.indexOf(target.split("/")[3] ?? "");
      if (targetLevel > originLevel && originLevel >= 0) findings.push(`${file}: ATOMIC_UPWARD_IMPORT — ${specifier}`);
    }
  }

  for (const file of await index.files("packages/ui/src/**/*.tsx")) {
    const layer = file.split("/")[3] ?? "";
    if (!LEVELS.includes(layer)) {
      findings.push(
        `${file}: UI_ATOMIC_LAYER — reusable presentation must live in atoms, molecules, organisms, or templates`,
      );
    }
  }

  for (const app of ["web", "mobile"]) {
    for (const dir of ["pages", "screens"]) {
      if (!(await directoryExists(`${root}/apps/${app}/src/${dir}`))) continue;
      const pageFiles = await index.files(`apps/${app}/src/${dir}/**/*.{ts,tsx}`);
      for (const file of pageFiles) {
        if (/-page\.(?:ts|tsx)$/.test(file))
          findings.push(`${file}: PAGE_SUFFIX — use the route or screen name without -page`);
      }
    }
  }

  const routeConfigPath = `${root}/apps/web/vite.config.ts`;
  if (await Bun.file(routeConfigPath).exists()) {
    const routeConfig = await index.text("apps/web/vite.config.ts");
    if (!/autoCodeSplitting\s*:\s*true/.test(routeConfig)) {
      findings.push("apps/web/vite.config.ts: WEB_LAZY_DEFAULT — file routes must be code-split by default");
    }
  }

  const utilityFiles = await index.files("packages/utils/src/**/*.ts");
  const consumers = new Set<string>();
  const consumerFiles: string[] = [];
  const appSourceRoots = ["apps/server", "apps/web/src", "apps/mobile/src"];
  let installedRoots = 0;
  for (const base of appSourceRoots) {
    if (await directoryExists(`${root}/${base}`)) installedRoots += 1;
  }
  for (const pattern of ["apps/server/**/*.{ts,tsx}", "apps/web/src/**/*.{ts,tsx}", "apps/mobile/src/**/*.{ts,tsx}"]) {
    const base = pattern.slice(0, pattern.indexOf("/**"));
    if (!(await directoryExists(`${root}/${base}`))) continue;
    consumerFiles.push(...(await index.files(pattern)));
  }
  for (const file of consumerFiles) {
    const source = await index.text(file);
    const imports = new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" }).scanImports(source);
    if (imports.some(({ path }) => path === "@bun-erp/utils" || path.startsWith("@bun-erp/utils/"))) {
      consumers.add(file.startsWith("apps/server/") ? "server" : file.startsWith("apps/web/") ? "web" : "mobile");
    }
  }
  // The rule only makes sense when two attached app runtimes exist to share the utility. Detached
  // web/mobile shells (Q30) ship no server contract and legitimately consume nothing yet.
  const hasServerApp = await directoryExists(`${root}/apps/server`);
  if (hasServerApp && installedRoots >= 2 && consumers.size < 2)
    findings.push("packages/utils: UTILS_NOT_CROSS_PLATFORM — require consumers in at least two apps");
  for (const file of utilityFiles) {
    const source = await index.text(file);
    const imports = new Bun.Transpiler({ loader: "ts" }).scanImports(source).map(({ path }) => path);
    if (
      imports.some(
        (path) => path.startsWith("node:") || /^(?:react|react-dom|hono|drizzle-orm|@capacitor\/)/.test(path),
      )
    ) {
      findings.push(`${file}: UTILS_PLATFORM_DEPENDENCY — shared utilities must remain runtime-neutral`);
    }
    if (/\b(?:window|document|navigator|process)\b|\bBun\s*\./.test(source)) {
      findings.push(`${file}: UTILS_PLATFORM_GLOBAL — use Web Platform APIs available in all targets`);
    }
  }

  findings.push(...(await featureBoundaryFindings(root, index)));
  return findings;
}
