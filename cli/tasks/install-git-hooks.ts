/**
 * Points `core.hooksPath` at `.githooks` so pushes run the Biome check.
 *
 * Runs from `bun install`'s `prepare` hook, which also executes in environments without git
 * (Docker images, tarball installs), so a missing `git` binary must be a no-op instead of a throw.
 */
const root = import.meta.dirname ? `${import.meta.dirname}/../..` : process.cwd();

function git(args: readonly string[]): { ok: boolean; output: string } {
  try {
    const proc = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    return { ok: proc.exitCode === 0, output: proc.stdout.toString().trim() };
  } catch {
    return { ok: false, output: "" };
  }
}

if (!git(["rev-parse", "--is-inside-work-tree"]).ok) {
  process.stderr.write("No Git work tree here; skipping the project pre-push hook.\n");
  process.exit(0);
}

const existing = git(["config", "--local", "--get", "core.hooksPath"]);
if (existing.ok && existing.output && existing.output !== ".githooks") {
  process.stderr.write(
    `Preserving existing Git hooks path (${existing.output}); set core.hooksPath=.githooks to enable the project pre-push check.\n`,
  );
  process.exit(0);
}

if (!git(["config", "--local", "core.hooksPath", ".githooks"]).ok) {
  process.stderr.write("Could not install project Git hooks; run `git config core.hooksPath .githooks` manually.\n");
  process.exit(0);
}
process.stdout.write("Installed project Git hooks; pushes now run the Biome check.\n");
