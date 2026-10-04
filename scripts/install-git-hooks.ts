const root = import.meta.dirname ? `${import.meta.dirname}/..` : process.cwd();
const existing = Bun.spawnSync(["git", "config", "--local", "--get", "core.hooksPath"], { cwd: root });
const currentPath = existing.exitCode === 0 ? existing.stdout.toString().trim() : "";

if (currentPath && currentPath !== ".githooks") {
  process.stderr.write(
    `Preserving existing Git hooks path (${currentPath}); set core.hooksPath=.githooks to enable the project pre-push check.\n`,
  );
  process.exit(0);
}

const configured = Bun.spawnSync(["git", "config", "--local", "core.hooksPath", ".githooks"], { cwd: root });
if (configured.exitCode !== 0) {
  process.stderr.write("Could not install project Git hooks; run `git config core.hooksPath .githooks` manually.\n");
  process.exit(0);
}
process.stdout.write("Installed project Git hooks; pushes now run the Biome check.\n");
