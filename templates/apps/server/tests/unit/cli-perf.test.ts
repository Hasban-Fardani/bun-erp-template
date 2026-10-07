import { expect, test } from "bun:test";

/**
 * Wall-clock budgets for the CLI inner loop. Marked slow: run with `ERP_PERF=1 bun test <file>` on
 * an idle machine, never as part of the regular suite. Budgets are the measured wall time + 30% on
 * the reference machine (2026-10-07, Bun 1.4.2): `check:fast` min 249 ms / p50 270 ms, `--help`
 * min 26 ms / p50 27 ms. Both stay under the F3.3 Phase B targets (`check:fast` < 1500 ms,
 * `--help` < 120 ms).
 */
const CHECK_FAST_BUDGET_MS = 350;
const HELP_BUDGET_MS = 40;

/** `import.meta.dir` is absolute; the trailing segments walk up to the repo root without node:path. */
const REPO_ROOT = `${import.meta.dir}/../../../..`;
const RUN_PERF = process.env.ERP_PERF === "1";

async function wallMs(argv: readonly string[]): Promise<number> {
  const started = performance.now();
  const proc = Bun.spawn([...argv], { cwd: REPO_ROOT, stdout: "ignore", stderr: "ignore" });
  await proc.exited;
  return performance.now() - started;
}

async function bestOf(argv: readonly string[], runs: number): Promise<number> {
  const times: number[] = [];
  for (let index = 0; index < runs; index += 1) times.push(await wallMs(argv));
  return Math.min(...times);
}

test.skipIf(!RUN_PERF)(
  "check:fast and --help stay inside their budgets on an installed server+web repo",
  async () => {
    // The budgets describe a repo where `bun erp init --apps server,web --yes` has been run; a
    // catalog-only checkout has no apps to measure and is skipped.
    if (!(await Bun.file(`${REPO_ROOT}/apps/server/package.json`).exists())) return;
    if (!(await Bun.file(`${REPO_ROOT}/apps/web/package.json`).exists())) return;

    const help = await bestOf(["bun", "erp", "--help"], 3);
    const fast = await bestOf(["bun", "erp", "check:fast"], 2);
    process.stdout.write(`cli-perf: --help ${help.toFixed(0)}ms, check:fast ${fast.toFixed(0)}ms\n`);

    expect(help).toBeLessThan(HELP_BUDGET_MS);
    expect(fast).toBeLessThan(CHECK_FAST_BUDGET_MS);
  },
  120000,
);
