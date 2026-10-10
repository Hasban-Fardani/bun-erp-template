import { dirname, join, normalize, relative, resolve } from "node:path";
import { LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import { createScanner } from "typescript/unstable/ast/scanner";
import { type FileIndex, fileIndex } from "../lib/file-index.ts";
import { rescanRegex } from "../lib/ts-scan.ts";
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

/** An import specifier that walks up three or more directories, e.g. `../../..` and deeper. */
const DEEP_RELATIVE_SPECIFIER = /^(?:\.\.\/){3,}/;
/** The same shape anywhere in a file, used as a cheap prefilter before parsing imports. */
const DEEP_RELATIVE_ANYWHERE = /\.\.\/\.\.\/\.\.\//;
const TYPE_ONLY_IMPORT = /(?:import|export)\s+type\s+[^;]+?\s+from\s+["']([^"']+)["']/g;

/** Half-open token spans of every string or template literal, so fixture text is not read as code. */
export function stringLiteralSpans(code: string, isTsx: boolean): Array<[number, number]> {
  const scanner = createScanner(true, isTsx ? LanguageVariant.JSX : LanguageVariant.Standard, code);
  const spans: Array<[number, number]> = [];
  let previous: SyntaxKind | undefined;
  while (true) {
    const kind = rescanRegex(scanner, scanner.scan(), previous);
    if (kind === SyntaxKind.EndOfFile) break;
    previous = kind;
    if (
      kind === SyntaxKind.StringLiteral ||
      kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
      kind === SyntaxKind.TemplateHead ||
      kind === SyntaxKind.TemplateMiddle ||
      kind === SyntaxKind.TemplateTail
    ) {
      spans.push([scanner.getTokenStart(), scanner.getTokenEnd()]);
    }
  }
  return spans;
}

/**
 * Type-only imports, which `Bun.Transpiler.scanImports` drops. A fixture string such as
 * `'import type { T } from "../../x.ts"'` also matches the pattern; the token scan shows the
 * match starts inside a string literal, so it is test data, not an import of this file.
 */
function typeOnlySpecifiers(code: string, isTsx: boolean): string[] {
  const spans = stringLiteralSpans(code, isTsx);
  const specifiers: string[] = [];
  for (const match of code.matchAll(TYPE_ONLY_IMPORT)) {
    const start = match.index ?? 0;
    if (spans.some(([spanStart, spanEnd]) => start >= spanStart && start < spanEnd)) continue;
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * Backward paths like `../../..` obscure which module owns the target and break when a file moves.
 * The tsconfig aliases name the owner instead: `@/` (server), `@web/` (web src), `@mobile/`
 * (mobile src) and `@cli/` (the root CLI). The scan covers the catalogs and the installed apps, so
 * a deep import fails both before and after `bun loom init`.
 */
async function noDeepRelativeFindings(index: FileIndex): Promise<string[]> {
  const findings: string[] = [];
  const files = await index.files([
    "apps/**/*.{ts,tsx}",
    "templates/**/*.{ts,tsx}",
    "packages/**/*.{ts,tsx}",
    "cli/**/*.{ts,tsx}",
  ]);
  for (const file of files) {
    const code = await index.text(file);
    // The cheap substring check keeps the transpiler off the files that cannot match.
    if (!DEEP_RELATIVE_ANYWHERE.test(code)) continue;
    const imports = new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" })
      .scanImports(code)
      .map(({ path }) => path);
    imports.push(...typeOnlySpecifiers(code, file.endsWith(".tsx")));
    for (const specifier of imports) {
      if (DEEP_RELATIVE_SPECIFIER.test(specifier)) {
        findings.push(`${file}: NO_DEEP_RELATIVE — ${specifier} uses three or more "../" segments; use a path alias`);
      }
    }
  }
  return findings;
}

/** Shared presentation stays usable without either application's runtime. */
export async function checkArchitecture(root: string): Promise<string[]> {
  const findings: string[] = [];
  const index = fileIndex(root);
  const files: string[] = [];
  for (const dir of ["apps/web/src", "apps/mobile/src", "packages/ui/src"]) {
    // apps/mobile/src only exists after `bun loom apps:create <name> mobile`.
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
        : specifier.startsWith("@loom/ui/")
          ? specifier.replace("@loom/ui/", "packages/ui/src/")
          : specifier;
      const shared = file.startsWith("packages/ui/src/");
      if (
        shared &&
        (/^(apps\/|@loom\/(web|mobile|server)(\/|$)|hono(\/|$))/.test(target) ||
          (target.startsWith("@tanstack/") && !SHARED_TANSTACK.has(target)))
      )
        findings.push(`${file}: UI_APPLICATION_DEPENDENCY — ${specifier}`);
      if (file.startsWith("apps/mobile/src/") && /^(apps\/web\/|@loom\/web(\/|$))/.test(target))
        findings.push(`${file}: MOBILE_WEB_SOURCE — ${specifier}`);
      if (file.startsWith("apps/web/src/") && /^(apps\/mobile\/|@loom\/mobile(\/|$))/.test(target))
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
    if (imports.some(({ path }) => path === "@loom/utils" || path.startsWith("@loom/utils/"))) {
      consumers.add(file.startsWith("apps/server/") ? "server" : file.startsWith("apps/web/") ? "web" : "mobile");
    }
  }
  // The rule only makes sense when two attached app runtimes exist to share the utility. Detached
  // web/mobile shells (docs/api-contract.md, detached mode) ship no server contract and legitimately consume nothing yet.
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

  findings.push(...(await noDeepRelativeFindings(index)));
  findings.push(...(await featureBoundaryFindings(root, index)));
  return findings;
}
