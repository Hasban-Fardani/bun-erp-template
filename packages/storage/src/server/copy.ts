import type { ObjectStorage } from "./types.ts";

export type CopyObjectsOptions = {
  source: ObjectStorage;
  destination: ObjectStorage;
  /** Only keys under this prefix are considered. */
  prefix?: string;
  /** Report what would be copied without writing. */
  dryRun?: boolean;
};

export type CopySummary = {
  copied: number;
  skipped: number;
  bytes: number;
  failed: Array<{ key: string; message: string }>;
  dryRun: boolean;
};

/**
 * Copies every object between two drivers. An object already present at the destination with the
 * same size is skipped, so a re-run after a crash only moves what is missing or truncated. Content
 * types are re-derived from the key because drivers expose bytes, not metadata.
 */
export async function copyObjects(options: CopyObjectsOptions): Promise<CopySummary> {
  const { source, destination, prefix, dryRun = false } = options;
  const existing = new Map<string, number>();
  for await (const entry of destination.listAll(prefix)) existing.set(entry.key, entry.size);

  const summary: CopySummary = { copied: 0, skipped: 0, bytes: 0, failed: [], dryRun };
  for await (const entry of source.listAll(prefix)) {
    if (existing.get(entry.key) === entry.size) {
      summary.skipped += 1;
      continue;
    }
    if (dryRun) {
      summary.copied += 1;
      summary.bytes += entry.size;
      continue;
    }
    try {
      const bytes = await source.get(entry.key);
      if (!bytes) throw new Error("object disappeared from the source");
      await destination.put(entry.key, bytes);
      summary.copied += 1;
      summary.bytes += bytes.byteLength;
    } catch (error) {
      summary.failed.push({ key: entry.key, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return summary;
}
