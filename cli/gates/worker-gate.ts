import { dirname, join, relative, resolve } from "node:path";

/**
 * Worker-safety gate. The Cloudflare Worker entry (`wrangler.jsonc` `main`) must bundle without
 * Bun-only globals, new Node built-ins, migration/seed modules or an over-budget script. The gate
 * scans the static import graph and, when `apps/server` is installed, bundles the same entry for a
 * browser/workerd-like target with `Bun.build` and inspects the emitted module graph and script.
 *
 * A module may use `Bun.*` only when it also contains a `typeof Bun` guard: that is the documented
 * runtime-adaptive pattern (`packages/storage` drivers, better-auth's env helper) and it is what
 * keeps those files working on both Bun and workerd. `import.meta.dir`/`import.meta.file` have no
 * workerd equivalent and are always findings.
 */

export type WorkerGateOptions = {
  /** Skip `Bun.build`; scan the static import graph only. */
  staticOnly?: boolean;
  /** Force the bundle step even when only the catalog copy is present. */
  bundle?: boolean;
};

export type WorkerGateResult = { findings: string[]; report: string[] };

const ENTRY_CANDIDATES = [
  "apps/server/bootstrap/cloudflare-entry.ts",
  "templates/apps/server/bootstrap/cloudflare-entry.ts",
] as const;

/** DDL, seeding and the SQL migration ledger are Bun-tooling paths and must stay out of the Worker. */
const DDL_PATH_MARKERS = [
  "/database/migrate.ts",
  "/database/seed.ts",
  "/database/sql-migration.ts",
  "/database/migrations/",
  "/database/seeders/",
] as const;

/**
 * Node built-ins the Worker graph already needs. `nodejs_compat` supplies them at runtime; each
 * entry names the dependency that needs it, so a new import is a deliberate decision instead of
 * a silent bundle-size and compatibility change.
 */
const NODE_BUILTIN_ALLOWLIST: Readonly<Record<string, string>> = {
  crypto: "postgres.js connection driver",
  fs: "postgres.js connection driver",
  net: "postgres.js connection driver",
  os: "postgres.js connection driver",
  perf_hooks: "postgres.js connection driver",
  stream: "postgres.js connection driver",
  tls: "postgres.js connection driver",
  sqlite: "better-auth kysely adapter (dynamic import, unused with the postgres driver)",
};

/**
 * Workers limits (Cloudflare docs, checked 2026-10-08): the script may be 64 MiB uncompressed on
 * Free and Paid alike, and there is no compressed-size limit. Larger scripts also slow startup,
 * so the template keeps its own much smaller budget on the uncompressed size.
 */
export const WORKER_PLATFORM_LIMIT_BYTES = 64 * 1024 * 1024;
/** The one size cap this gate enforces, on the uncompressed script (`wrangler` "Total Upload"). */
export const WORKER_RAW_BUDGET_BYTES = 2 * 1024 * 1024;

/** Packages that must never reach the Worker script (Scalar is Bun-target only, see `http/app.ts`). */
const WORKER_FORBIDDEN_PACKAGES = ["@scalar/"] as const;

const mib = (bytes: number) => `${bytes / (1024 * 1024)} MiB`;

/** The single size rule: raw script bytes against the template budget. */
export function workerSizeFindings(rawBytes: number): string[] {
  if (rawBytes <= WORKER_RAW_BUDGET_BYTES) return [];
  return [
    `WORKER_BUNDLE_SIZE: the script is ${rawBytes} bytes uncompressed, above the ${WORKER_RAW_BUDGET_BYTES} byte (${mib(WORKER_RAW_BUDGET_BYTES)}) template budget (Workers allows ${mib(WORKER_PLATFORM_LIMIT_BYTES)} uncompressed on Free and Paid)`,
  ];
}

const NODE_BUILTIN =
  /^(assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|sqlite|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)(\/.*)?$/;

const IMPORT_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*["']([^"']+)["']/g,
];

const transpilers = {
  ts: new Bun.Transpiler({ loader: "ts" }),
  tsx: new Bun.Transpiler({ loader: "tsx" }),
};

const toPosix = (path: string) => path.split("\\").join("/");

function transpile(file: string, source: string): string {
  return transpilers[file.endsWith(".tsx") ? "tsx" : "ts"].transformSync(source);
}

function importSpecifiers(code: string): string[] {
  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found];
}

function moduleFindings(file: string, code: string): string[] {
  const findings: string[] = [];
  const bunRefs = [...new Set([...code.matchAll(/\bBun\.[A-Za-z_$][\w$]*/g)].map((match) => match[0]))];
  if (bunRefs.length > 0 && !/\btypeof\s+Bun\b/.test(code)) {
    findings.push(
      `WORKER_BUN_GLOBAL: ${file} uses ${bunRefs.join(", ")} without a typeof Bun guard; guard it or move the code to Bun-only tooling`,
    );
  }
  const metaRefs = [...new Set([...code.matchAll(/import\.meta\.(?:dir|file|dirname|filename)\b/g)].map((m) => m[0]))];
  if (metaRefs.length > 0) {
    findings.push(`WORKER_IMPORT_META: ${file} uses ${metaRefs.join(", ")}; workerd has no Bun path metadata`);
  }
  for (const specifier of importSpecifiers(code)) {
    if (WORKER_FORBIDDEN_PACKAGES.some((prefix) => specifier.startsWith(prefix))) {
      findings.push(`WORKER_FORBIDDEN_PACKAGE: ${file} imports ${specifier}; load it only on the Bun target`);
    }
    if (specifier.startsWith("node:")) {
      findings.push(
        `WORKER_NODE_BUILTIN: ${file} imports ${specifier}; only documented Node built-ins may reach the Worker graph`,
      );
    }
  }
  return findings;
}

function ddlFinding(file: string): string | undefined {
  const normalized = `/${toPosix(file)}`;
  for (const marker of DDL_PATH_MARKERS) {
    if (normalized.includes(marker)) {
      return `WORKER_DDL_PATH: ${file} is reachable from the Worker entry; migrations, seeds and SQL-ledger code stay in Bun tooling`;
    }
  }
  return undefined;
}

async function resolveRelative(root: string, fromFile: string, specifier: string): Promise<string | undefined> {
  const base = toPosix(join(dirname(fromFile), specifier));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (await Bun.file(join(root, candidate)).exists()) return candidate;
  }
  return undefined;
}

/** Resolves `@loom/<package>[/<subpath>]` through the package's `exports` map, without node_modules. */
async function resolveWorkspacePackage(root: string, specifier: string): Promise<string | undefined> {
  const match = /^@loom\/([^/]+)(?:\/(.+))?$/.exec(specifier);
  if (!match) return undefined;
  const [, name, subpath] = match;
  const manifestPath = join(root, "packages", name ?? "", "package.json");
  if (!(await Bun.file(manifestPath).exists())) return undefined;
  const manifest = (await Bun.file(manifestPath).json()) as {
    exports?: Record<string, string | Record<string, string>>;
  };
  const entry = manifest.exports?.[subpath ? `./${subpath}` : "."];
  const target = typeof entry === "string" ? entry : (entry?.import ?? entry?.default ?? entry?.types);
  if (typeof target !== "string") return undefined;
  return toPosix(join("packages", name ?? "", target.replace(/^\.\//, "")));
}

async function resolveModule(root: string, fromFile: string, specifier: string): Promise<string | undefined> {
  if (specifier.startsWith(".")) return resolveRelative(root, fromFile, specifier);
  return resolveWorkspacePackage(root, specifier);
}

/** Walks value imports from the Worker entry; type-only imports are erased by the transpiler. */
export async function scanWorkerGraph(root: string, entry: string): Promise<{ modules: string[]; findings: string[] }> {
  const findings: string[] = [];
  const visited = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = await Bun.file(join(root, file)).text();
    const code = transpile(file, source);
    findings.push(...moduleFindings(file, code));
    const ddl = ddlFinding(file);
    if (ddl) findings.push(ddl);
    for (const specifier of importSpecifiers(code)) {
      const resolved = await resolveModule(root, file, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return { modules: [...visited], findings };
}

export async function findWorkerEntry(root: string): Promise<string | undefined> {
  for (const candidate of ENTRY_CANDIDATES) {
    if (await Bun.file(join(root, candidate)).exists()) return candidate;
  }
  return undefined;
}

function displayPath(root: string, path: string): string {
  const absolute = resolve(process.cwd(), path);
  const display = toPosix(relative(root, absolute));
  return display.startsWith("..") ? toPosix(path) : display;
}

async function bundleWorker(root: string, entry: string): Promise<WorkerGateResult> {
  const findings: string[] = [];
  const report: string[] = [];
  const result = await Bun.build({
    entrypoints: [resolve(root, entry)],
    target: "browser",
    format: "esm",
    minify: true,
    metafile: true,
    external: ["cloudflare:*"],
    plugins: [
      {
        name: "worker-node-externals",
        setup(build) {
          build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
          build.onResolve({ filter: NODE_BUILTIN }, (args) => ({ path: args.path, external: true }));
        },
      },
    ],
  });

  if (!result.success || result.outputs.length === 0) {
    const detail = result.logs
      .map((log) => String(log).trim())
      .slice(0, 3)
      .join(" | ");
    findings.push(`WORKER_BUNDLE_FAILED: Bun.build could not bundle ${entry}: ${detail}`);
    return { findings, report };
  }

  const bytes = new Uint8Array(await (result.outputs[0] as Bun.BuildArtifact).arrayBuffer());
  const gzipBytes = Bun.gzipSync(bytes).byteLength;
  findings.push(...workerSizeFindings(bytes.byteLength));

  const text = new TextDecoder().decode(bytes);
  const metaHits = [...new Set([...text.matchAll(/import\.meta\.(?:dir|file|dirname|filename)\b/g)].map((m) => m[0]))];
  if (metaHits.length > 0) {
    findings.push(`WORKER_IMPORT_META: the bundle contains ${metaHits.join(", ")}`);
  }

  const inputs = Object.entries(result.metafile?.inputs ?? {});
  const builtins = new Set<string>();
  const unexpected = new Map<string, string>();
  for (const [file, meta] of inputs) {
    for (const imported of meta.imports ?? []) {
      if (!imported.external) continue;
      const builtin = imported.path.startsWith("node:") ? imported.path.slice("node:".length) : imported.path;
      if (!NODE_BUILTIN.test(builtin)) continue;
      builtins.add(builtin);
      if (builtin in NODE_BUILTIN_ALLOWLIST) continue;
      if (!unexpected.has(builtin)) unexpected.set(builtin, displayPath(root, file));
    }
  }
  for (const [builtin, importer] of unexpected) {
    findings.push(
      `WORKER_NODE_BUILTIN_BUNDLE: ${builtin} reaches the bundle via ${importer}; allowlist it in cli/gates/worker-gate.ts only with a documented runtime need`,
    );
  }

  for (const prefix of WORKER_FORBIDDEN_PACKAGES) {
    if (inputs.some(([file]) => file.includes(`node_modules/${prefix}`))) {
      findings.push(`WORKER_FORBIDDEN_PACKAGE: ${prefix}* is in the Worker bundle; load it only on the Bun target`);
    }
  }

  let firstParty = 0;
  for (const [file] of inputs) {
    const display = displayPath(root, file);
    const finding = ddlFinding(display);
    if (finding) findings.push(finding);
    if (file.includes("node_modules/")) continue;
    firstParty += 1;
    const code = transpile(display, await Bun.file(resolve(process.cwd(), file)).text());
    findings.push(...moduleFindings(display, code));
  }

  report.push(
    `worker bundle: ${bytes.byteLength} bytes raw / ${gzipBytes} bytes gzip (budget ${WORKER_RAW_BUDGET_BYTES} bytes uncompressed; Workers limit ${mib(WORKER_PLATFORM_LIMIT_BYTES)} uncompressed)`,
  );
  report.push(`worker graph: ${firstParty} first-party modules, ${inputs.length} total`);
  report.push(`worker node built-ins: ${[...builtins].sort().join(", ") || "none"}`);
  return { findings, report };
}

export async function runWorkerGate(root: string, options: WorkerGateOptions = {}): Promise<WorkerGateResult> {
  const findings: string[] = [];
  const report: string[] = [];
  const entry = await findWorkerEntry(root);
  if (!entry) {
    return { findings, report: ["worker entry: not found; install apps/server or keep templates/apps/server"] };
  }
  const installed = entry.startsWith("apps/");
  const staticScan = await scanWorkerGraph(root, entry);
  findings.push(...staticScan.findings);
  report.push(`worker entry: ${entry}${installed ? "" : " (catalog copy; apps/server is not installed)"}`);
  report.push(`worker static graph: ${staticScan.modules.length} modules`);

  const shouldBundle = options.bundle === true || (!options.staticOnly && installed);
  if (shouldBundle) {
    const bundle = await bundleWorker(root, entry);
    findings.push(...bundle.findings);
    report.push(...bundle.report);
  } else {
    report.push("worker bundle: skipped (static scan only)");
  }
  return { findings: [...new Set(findings)], report };
}

/** Catalog entrypoint used by `bun loom check` and `check:gate worker`. */
export async function checkWorker(root: string): Promise<string[]> {
  return (await runWorkerGate(root)).findings;
}
