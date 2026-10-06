import { GATE_CATALOG } from "../lib/gates.ts";

export type GateResult = { name: string; ok: boolean; output: string; ms: number };
export type CheckJob = { name: string; argv: readonly string[] };
export type CheckRunOptions = {
  concurrency?: number;
  onResult?: (result: GateResult) => void;
};

const DEFAULT_CONCURRENCY = 6;

/** The `check` runner derives its job list from the catalog in cli/lib/gates.ts. */
const GATES: readonly { name: string; command: string }[] = GATE_CATALOG.map(({ name, command }) => ({
  name,
  command,
}));

async function runOne(root: string, job: CheckJob): Promise<GateResult> {
  const started = performance.now();
  try {
    const proc = Bun.spawn([...job.argv], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return {
      name: job.name,
      ok: code === 0,
      output: `${out}${err}`.trim(),
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return { name: job.name, ok: false, output: String(error), ms: Math.round(performance.now() - started) };
  }
}

/** Read-only checks run concurrently without exhausting the host or hiding their progress. */
export async function runChecksParallel(
  root: string,
  jobs: readonly CheckJob[],
  options: CheckRunOptions = {},
): Promise<GateResult[]> {
  const requestedConcurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const concurrency = Math.max(
    1,
    Math.min(
      jobs.length || 1,
      Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : DEFAULT_CONCURRENCY,
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
      ...GATES.map(({ name, command }) => ({ name, argv: ["bun", "cli/index.ts", command] })),
    ],
    options,
  );
}

/**
 * The inner loop: file-level gates only. The full `check` adds the whole-monorepo `tsc` and the
 * React audit, which dominate its runtime; those stay in CI, this stays under a second.
 */
const FAST_GATE_NAMES = new Set([
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
      ...GATES.filter(({ name }) => FAST_GATE_NAMES.has(name)).map(({ name, command }) => ({
        name,
        argv: ["bun", "cli/index.ts", command],
      })),
    ],
    options,
  );
}
