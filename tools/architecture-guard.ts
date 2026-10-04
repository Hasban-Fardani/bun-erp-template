import { dirname, relative, resolve } from "node:path";

const LEVELS = ["atoms", "molecules", "organisms", "templates"];
// Shared data tables use TanStack's headless core; router, query and application form state stay app-owned.
const SHARED_TANSTACK = new Set(["@tanstack/react-table"]);

/** Shared presentation stays usable without either application's runtime. */
export async function checkArchitecture(root: string): Promise<string[]> {
  const findings: string[] = [];
  const files = ["apps/web/src", "apps/mobile/src", "packages/ui/src"].flatMap((dir) => [
    ...new Bun.Glob(`${dir}/**/*.{ts,tsx}`).scanSync({ cwd: root }),
  ]);
  for (const file of files) {
    const code = await Bun.file(`${root}/${file}`).text();
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

  for (const file of new Bun.Glob("packages/ui/src/**/*.tsx").scanSync({ cwd: root })) {
    const layer = file.split("/")[3] ?? "";
    if (!LEVELS.includes(layer)) {
      findings.push(
        `${file}: UI_ATOMIC_LAYER — reusable presentation must live in atoms, molecules, organisms, or templates`,
      );
    }
  }

  for (const app of ["web", "mobile"]) {
    const pageFiles = new Bun.Glob(`apps/${app}/src/pages/**/*.{ts,tsx}`).scanSync({ cwd: root });
    for (const file of pageFiles) {
      if (/-page\.(?:ts|tsx)$/.test(file))
        findings.push(`${file}: PAGE_SUFFIX — use the route or screen name without -page`);
    }
  }

  const routeConfig = await Bun.file(`${root}/apps/web/vite.config.ts`).text();
  if (!/autoCodeSplitting\s*:\s*true/.test(routeConfig)) {
    findings.push("apps/web/vite.config.ts: WEB_LAZY_DEFAULT — file routes must be code-split by default");
  }

  const utilityFiles = [...new Bun.Glob("packages/utils/src/**/*.ts").scanSync({ cwd: root })];
  const consumers = new Set<string>();
  for (const file of [
    ...new Bun.Glob("apps/server/**/*.{ts,tsx}").scanSync({ cwd: root }),
    ...new Bun.Glob("apps/web/src/**/*.{ts,tsx}").scanSync({ cwd: root }),
    ...new Bun.Glob("apps/mobile/src/**/*.{ts,tsx}").scanSync({ cwd: root }),
  ]) {
    const source = await Bun.file(`${root}/${file}`).text();
    const imports = new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" }).scanImports(source);
    if (imports.some(({ path }) => path === "@bun-erp/utils" || path.startsWith("@bun-erp/utils/"))) {
      consumers.add(file.startsWith("apps/server/") ? "server" : file.startsWith("apps/web/") ? "web" : "mobile");
    }
  }
  if (consumers.size < 2)
    findings.push("packages/utils: UTILS_NOT_CROSS_PLATFORM — require consumers in at least two apps");
  for (const file of utilityFiles) {
    const source = await Bun.file(`${root}/${file}`).text();
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
  return findings;
}
