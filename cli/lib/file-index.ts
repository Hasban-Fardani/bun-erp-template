import { resolve } from "node:path";

/**
 * One async filesystem scan per glob per root per process.
 *
 * Gates used to call `new Bun.Glob(...).scanSync()` individually: every gate blocked the shared
 * event loop and repeated the same tree walk (the UI roots alone were scanned by six gates). This
 * index memoizes the promise per glob, so concurrent gates asking for the same glob share one
 * scan, and it caches file contents per path. Sync IO stays out of the gate process entirely.
 */

export type Scanner = (glob: string) => AsyncIterable<string> | Iterable<string>;
export type Reader = (path: string) => Promise<string>;

export type FileIndexOptions = {
  /** Test seam: the production default scans with `Bun.Glob`. */
  scan?: Scanner;
  /** Test seam: the production default reads with `Bun.file`. */
  read?: Reader;
};

export type FileIndex = {
  /** Repo-relative paths matching any glob, sorted and deduplicated. */
  files(globs: string | readonly string[]): Promise<string[]>;
  /** File contents, read once per path. */
  text(path: string): Promise<string>;
};

export function createFileIndex(root: string, options: FileIndexOptions = {}): FileIndex {
  const scanner: Scanner = options.scan ?? ((glob) => new Bun.Glob(glob).scan({ cwd: root, onlyFiles: true }));
  const reader: Reader = options.read ?? ((path) => Bun.file(resolve(root, path)).text());

  const scans = new Map<string, Promise<string[]>>();
  const reads = new Map<string, Promise<string>>();

  async function scanGlob(glob: string): Promise<string[]> {
    const found = new Set<string>();
    try {
      for await (const file of scanner(glob)) found.add(file);
    } catch {
      // A missing scan root is an empty result, not a crash: `apps/` ships empty by default.
    }
    return [...found].sort();
  }

  return {
    async files(globs) {
      const list = typeof globs === "string" ? [globs] : globs;
      const merged = new Set<string>();
      for (const glob of list) {
        let scan = scans.get(glob);
        if (!scan) {
          scan = scanGlob(glob);
          scans.set(glob, scan);
        }
        for (const file of await scan) merged.add(file);
      }
      return [...merged].sort();
    },

    async text(path) {
      let read = reads.get(path);
      if (!read) {
        read = reader(path);
        reads.set(path, read);
      }
      return read;
    },
  };
}

const indexes = new Map<string, FileIndex>();

/** The process-wide index for `root`; every gate in a run shares its scans and reads. */
export function fileIndex(root: string): FileIndex {
  const key = resolve(root);
  let existing = indexes.get(key);
  if (!existing) {
    existing = createFileIndex(key);
    indexes.set(key, existing);
  }
  return existing;
}

/** Drop memoized indexes. Tests that rewrite a fixture root use this; production never calls it. */
export function clearFileIndexes(): void {
  indexes.clear();
}
