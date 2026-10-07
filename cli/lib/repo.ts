import { resolve } from "node:path";

/**
 * Shared CLI paths and subprocess helpers. Command modules import these so the repo root and the
 * failure contract live in one place instead of being duplicated per command group. `Bun.$` stays
 * for one-line shell use (mkdir/cp/mv); everything that spawns a program goes through `run`.
 */
export const repoRoot = resolve(import.meta.dir, "../..");
export const MIGRATIONS_DIR = resolve(repoRoot, "apps/server/database/migrations");
export const SEEDERS_DIR = resolve(repoRoot, "apps/server/database/seeders");
export const TASKS_DIR = resolve(repoRoot, "docs/tasks");
export const SKILLS_DIR = resolve(repoRoot, "skills");

export type RunOptions = {
  /** Defaults to the repo root. */
  cwd?: string;
  /** "inherit" streams to the terminal; "pipe" captures into the result; "ignore" discards. */
  stdout?: "inherit" | "pipe" | "ignore";
  stderr?: "inherit" | "pipe" | "ignore";
  /** `false` returns the exit code instead of throwing. Defaults to throwing. */
  check?: boolean;
};

export type RunResult = { stdout: string; stderr: string; exitCode: number };

/**
 * A failing subprocess must stop the command — the thrown error is reported by `cli/index.ts`.
 * With `check: false` the caller decides what a non-zero exit means and reads the captured output.
 */
export async function run(argv: readonly string[], label: string, options: RunOptions = {}): Promise<RunResult> {
  const proc = Bun.spawn([...argv], {
    cwd: options.cwd ?? repoRoot,
    stdout: options.stdout ?? "inherit",
    stderr: options.stderr ?? "inherit",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    options.stdout === "pipe" ? new Response(proc.stdout).text() : Promise.resolve(""),
    options.stderr === "pipe" ? new Response(proc.stderr).text() : Promise.resolve(""),
    proc.exited,
  ]);
  if (options.check !== false && exitCode !== 0) throw new Error(`${label} failed with exit ${exitCode}`);
  return { stdout, stderr, exitCode };
}

/** Gate findings are reported as a list and thrown for `cli/index.ts` to exit on. */
export class GateFailure extends Error {
  readonly findings: string[];
  constructor(findings: string[]) {
    super(`${findings.length} finding(s)`);
    this.findings = findings;
  }
}

export async function guard(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof GateFailure) {
      throw new Error(`${label} failed:\n${err.findings.map((f) => `  ${f}`).join("\n")}`);
    }
    throw err;
  }
}
