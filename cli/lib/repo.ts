import { resolve } from "node:path";

/**
 * Shared CLI paths and subprocess helpers. Command modules import these so the repo root and
 * failure contract live in one place instead of being duplicated per command group.
 */
export const repoRoot = resolve(import.meta.dir, "../..");
export const MIGRATIONS_DIR = resolve(repoRoot, "apps/server/database/migrations");
export const SEEDERS_DIR = resolve(repoRoot, "apps/server/database/seeders");
export const TASKS_DIR = resolve(repoRoot, "docs/tasks");
export const SKILLS_DIR = resolve(repoRoot, "skills");

/** A failing subprocess must stop the command — the thrown error is reported by `cli/index.ts`. */
export async function run(argv: readonly string[], label: string): Promise<void> {
  const proc = Bun.spawn([...argv], { cwd: repoRoot, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${label} failed with exit ${code}`);
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
