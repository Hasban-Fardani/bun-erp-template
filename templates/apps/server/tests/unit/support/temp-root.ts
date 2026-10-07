import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Temp-repo fixtures for unit tests. `mkdtemp`/`tmpdir` have no direct Bun replacement, so this
 * helper is the single exempted file; the tests that use it stay free of Node built-ins.
 */
export async function makeTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeFixtureFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await Bun.write(target, contents);
  }
}

export async function removeTempRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

/** Creates a temp root, writes the fixture files, runs the body, and always removes the root. */
export async function withTempRoot(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
  prefix = "fixture-",
): Promise<void> {
  const root = await makeTempRoot(prefix);
  try {
    await writeFixtureFiles(root, files);
    await run(root);
  } finally {
    await removeTempRoot(root);
  }
}
