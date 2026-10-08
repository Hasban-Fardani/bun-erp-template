import { expect, test } from "bun:test";
import { repoRoot } from "@cli/lib/repo.ts";

/**
 * Wall-clock budgets for the CLI inner loop, set at 3x the measured baseline so a loaded machine
 * does not flake while a real regression (an eager import, a registry scan per command) still fails.
 *
 * Baseline (2026-10-08, Bun 1.4.2, macOS arm64, server + web + mail installed, load average ~3):
 * `bun erp --help` min 59 ms (5 runs), `bun erp check:fast` min 398 ms (3 runs). On an idle machine
 * the same commands took 27 ms and 270 ms (F3.3 Phase B), so the factor also absorbs a busy host.
 * Re-measure and update BASELINE_MS in the same commit when a command legitimately gets slower.
 *
 * `ERP_PERF_FACTOR=<n>` overrides the factor for one run (the budget tightening check uses 0.5);
 * `ERP_PERF=0` skips the test on hosts where wall-clock time is meaningless.
 */
const BASELINE_MS = { help: 59, checkFast: 398 } as const;
const FACTOR = Number(process.env.ERP_PERF_FACTOR ?? "3");
const HELP_BUDGET_MS = BASELINE_MS.help * FACTOR;
const CHECK_FAST_BUDGET_MS = BASELINE_MS.checkFast * FACTOR;

const SKIP = process.env.ERP_PERF === "0";

async function wallMs(argv: readonly string[]): Promise<number> {
  const started = performance.now();
  const proc = Bun.spawn([...argv], { cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  await proc.exited;
  return performance.now() - started;
}

async function bestOf(argv: readonly string[], runs: number): Promise<number> {
  const times: number[] = [];
  for (let index = 0; index < runs; index += 1) times.push(await wallMs(argv));
  return Math.min(...times);
}

test("the budgets are three times the recorded baseline", () => {
  if (process.env.ERP_PERF_FACTOR === undefined) {
    expect(HELP_BUDGET_MS).toBe(BASELINE_MS.help * 3);
    expect(CHECK_FAST_BUDGET_MS).toBe(BASELINE_MS.checkFast * 3);
  }
});

test.skipIf(SKIP)(
  "bun erp --help stays inside its budget",
  async () => {
    // The budget describes a repo where `bun erp init --apps server,web --yes` has been run.
    if (!(await Bun.file(`${repoRoot}/apps/server/package.json`).exists())) return;
    const help = await bestOf(["bun", "erp", "--help"], 3);
    process.stdout.write(`cli-perf: --help ${help.toFixed(0)}ms (budget ${HELP_BUDGET_MS}ms)\n`);
    expect(help).toBeLessThan(HELP_BUDGET_MS);
  },
  60_000,
);

test.skipIf(SKIP)(
  "bun erp check:fast stays inside its budget",
  async () => {
    if (!(await Bun.file(`${repoRoot}/apps/server/package.json`).exists())) return;
    if (!(await Bun.file(`${repoRoot}/apps/web/package.json`).exists())) return;
    const fast = await bestOf(["bun", "erp", "check:fast"], 2);
    process.stdout.write(`cli-perf: check:fast ${fast.toFixed(0)}ms (budget ${CHECK_FAST_BUDGET_MS}ms)\n`);
    expect(fast).toBeLessThan(CHECK_FAST_BUDGET_MS);
  },
  120_000,
);
