import { resolve } from "node:path";
import { repoRoot, run, SEEDERS_DIR } from "./repo.ts";

export async function writeScaffold(path: string, source: string): Promise<void> {
  if (await Bun.file(path).exists()) throw new Error(`Refusing to overwrite existing file: ${path}`);
  await Bun.$`mkdir -p ${resolve(path, "..")}`.quiet();
  await Bun.write(path, source);
}

/** Generated code must survive `bun run lint`; let the repo's own checker settle formatting and import order. */
export async function formatScaffold(paths: readonly string[]): Promise<void> {
  const biome = resolve(repoRoot, "node_modules/.bin/biome");
  if (!(await Bun.file(biome).exists())) return;
  await run([biome, "check", "--write", ...paths], "format scaffold", {
    stdout: "ignore",
    stderr: "ignore",
    check: false,
  });
}

/** The web router types every page from routeTree.gen.ts; a new page must regenerate it or tsc fails. */
export async function regenerateWebRouteTree(): Promise<void> {
  const result = await run(["bun", "run", "--cwd", "apps/web", "build"], "web route generation", {
    stdout: "pipe",
    stderr: "pipe",
    check: false,
  });
  if (result.exitCode !== 0) {
    throw new Error(`Web route generation failed (vite build):\n${result.stderr || result.stdout}`);
  }
}

export function listSeederFiles(): string[] {
  try {
    return [...new Bun.Glob("*.ts").scanSync({ cwd: SEEDERS_DIR })].sort();
  } catch {
    return [];
  }
}
