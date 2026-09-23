/**
 * Runs the independent gates in parallel and reports every failure at once.
 *
 * Sequential `check` took long enough that people skipped it; the gates themselves are
 * independent (each reads the tree, none writes), so they run concurrently. The two slow
 * whole-project tools (biome, tsc) go first because a type error explains most gate noise.
 */
export type GateResult = { name: string; ok: boolean; output: string; ms: number };

/** `command` must match a real `bun erp` command; the name is only for the report. */
const GATES: readonly { name: string; command: string }[] = [
  { name: "scope", command: "check:scope" },
  { name: "slop", command: "check:slop" },
  { name: "platform", command: "check:platform" },
  { name: "copy", command: "check:copy" },
  { name: "design", command: "check:design" },
  { name: "ui", command: "check:ui" },
  { name: "shadcn", command: "check:shadcn" },
  { name: "surface", command: "check:surface" },
  { name: "react", command: "check:react" },
  { name: "migrations", command: "check:migrations" },
  { name: "skills", command: "skills:validate" },
  { name: "task", command: "check:task" },
  { name: "readiness", command: "check:prod" },
];

async function runOne(root: string, gate: { name: string; command: string }): Promise<GateResult> {
  const started = performance.now();
  const proc = Bun.spawn(["bun", "erp.ts", gate.command], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    name: gate.name,
    ok: code === 0,
    output: `${out}${err}`.trim(),
    ms: Math.round(performance.now() - started),
  };
}

export async function runGatesParallel(root: string): Promise<GateResult[]> {
  // `readiness` shells out to git and the others read the same tree, but none of them mutates
  // state, so running all twelve at once is safe.
  return Promise.all(GATES.map((gate) => runOne(root, gate)));
}
