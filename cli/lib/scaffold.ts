import { resolve } from "node:path";
import { repoRoot, SEEDERS_DIR } from "./repo.ts";

export async function writeScaffold(path: string, source: string): Promise<void> {
  if (await Bun.file(path).exists()) throw new Error(`Refusing to overwrite existing file: ${path}`);
  await Bun.$`mkdir -p ${resolve(path, "..")}`.quiet();
  await Bun.write(path, source);
}

/** Generated code must survive `bun run lint`; let the repo's own checker settle formatting and import order. */
export async function formatScaffold(paths: readonly string[]): Promise<void> {
  const biome = resolve(repoRoot, "node_modules/.bin/biome");
  if (!(await Bun.file(biome).exists())) return;
  const proc = Bun.spawn([biome, "check", "--write", ...paths], {
    cwd: repoRoot,
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
}

/** The web router types every page from routeTree.gen.ts; a new page must regenerate it or tsc fails. */
export async function regenerateWebRouteTree(): Promise<void> {
  const proc = Bun.spawn(["bun", "run", "--cwd", "apps/web", "build"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`Web route generation failed (vite build):\n${err || out}`);
}

export function listSeederFiles(): string[] {
  try {
    return [...new Bun.Glob("*.ts").scanSync({ cwd: SEEDERS_DIR })].sort();
  } catch {
    return [];
  }
}
