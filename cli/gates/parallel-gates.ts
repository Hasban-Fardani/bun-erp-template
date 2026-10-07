import { collectGateFindings, GATE_CATALOG, type GateName } from "../lib/gates.ts";

export type GateResult = { name: string; ok: boolean; output: string; ms: number };
export type CheckJob = {
  readonly name: string;
  /** Spawned command; exactly one of `argv` or `gate` is set. */
  readonly argv?: readonly string[];
  /** Catalog gate dispatched in-process through `collectGateFindings`. */
  readonly gate?: GateName;
};
export type CheckRunOptions = {
  concurrency?: number;
  onResult?: (result: GateResult) => void;
};

const DEFAULT_CONCURRENCY = 8;

/**
 * Gates whose implementation shells out to another binary stay in a child process: that isolates
 * their direct stdout (React Doctor warnings) and keeps a blocking spawn from stalling the
 * in-process pool. Everything else runs through `collectGateFindings` with no CLI cold start.
 */
const SPAWNED_GATE_NAMES: ReadonlySet<GateName> = new Set(["impeccable", "react", "readiness", "scope", "slop"]);

/** The default pool size: eight jobs, never more than the host's logical cores when it reports them. */
export function defaultConcurrency(): number {
  const cores = typeof navigator === "undefined" ? undefined : navigator.hardwareConcurrency;
  return Math.max(1, Math.min(DEFAULT_CONCURRENCY, cores || DEFAULT_CONCURRENCY));
}

/** The `check` runner derives its job list from the catalog in cli/lib/gates.ts. */
const GATES: readonly (CheckJob & { name: GateName })[] = GATE_CATALOG.map(({ name, command }) =>
  SPAWNED_GATE_NAMES.has(name) ? { name, argv: ["bun", "cli/index.ts", command] } : { name, gate: name },
);

async function runSpawnedJob(
  root: string,
  name: string,
  argv: readonly string[],
  started: number,
): Promise<GateResult> {
  try {
    const proc = Bun.spawn([...argv], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { name, ok: code === 0, output: `${out}${err}`.trim(), ms: Math.round(performance.now() - started) };
  } catch (error) {
    return { name, ok: false, output: String(error), ms: Math.round(performance.now() - started) };
  }
}

async function runGateJob(root: string, name: string, gate: GateName, started: number): Promise<GateResult> {
  try {
    const findings = await collectGateFindings(gate, root);
    const output =
      findings.length === 0 ? "" : `${name} failed:\n${findings.map((finding) => `  ${finding}`).join("\n")}`;
    return { name, ok: findings.length === 0, output, ms: Math.round(performance.now() - started) };
  } catch (error) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    return { name, ok: false, output: `${name} crashed:\n${detail}`, ms: Math.round(performance.now() - started) };
  }
}

async function runOne(root: string, job: CheckJob): Promise<GateResult> {
  const started = performance.now();
  if (job.gate) return runGateJob(root, job.name, job.gate, started);
  if (job.argv) return runSpawnedJob(root, job.name, job.argv, started);
  return { name: job.name, ok: false, output: `check job "${job.name}" has neither argv nor gate`, ms: 0 };
}

/** Read-only checks run concurrently without exhausting the host or hiding their progress. */
export async function runChecksParallel(
  root: string,
  jobs: readonly CheckJob[],
  options: CheckRunOptions = {},
): Promise<GateResult[]> {
  const requestedConcurrency = options.concurrency ?? defaultConcurrency();
  const concurrency = Math.max(
    1,
    Math.min(
      jobs.length || 1,
      Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : defaultConcurrency(),
    ),
  );
  const results = new Array<GateResult>(jobs.length);
  let next = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < jobs.length) {
        const index = next++;
        const job = jobs[index];
        if (!job) continue;
        const result = await runOne(root, job);
        results[index] = result;
        options.onResult?.(result);
      }
    }),
  );

  return results;
}

export function runProjectChecks(root: string, options?: CheckRunOptions): Promise<GateResult[]> {
  return runChecksParallel(
    root,
    [
      { name: "biome", argv: ["bunx", "--bun", "biome", "check", "."] },
      { name: "types", argv: ["bunx", "--bun", "tsc", "-p", "tsconfig.json"] },
      ...GATES,
    ],
    options,
  );
}

/**
 * The inner loop: file-level gates only. The full `check` adds the whole-monorepo `tsc` and the
 * React audit, which dominate its runtime; those stay in CI, this stays under a second. `impeccable`
 * also stays out: its detector engine is networked on first run. `worker` stays out too: it builds
 * the Worker bundle (~0.3 s) and belongs to the full check.
 */
const FAST_GATE_NAMES: ReadonlySet<GateName> = new Set([
  "architecture",
  "copy",
  "design",
  "language",
  "motion",
  "package-targets",
  "scope",
  "shadcn",
  "slop",
  "surface",
  "tdd",
  "ui",
]);

export function runFastChecks(root: string, options?: CheckRunOptions): Promise<GateResult[]> {
  return runChecksParallel(
    root,
    [
      { name: "biome", argv: ["bunx", "--bun", "biome", "check", "."] },
      ...GATES.filter(({ name }) => FAST_GATE_NAMES.has(name)),
    ],
    options,
  );
}
