import type { CacheDriver } from "./types.ts";

type Entry = { value: string; expiresAt: number };

const MAX_ENTRIES = 5_000;

/** Per-process cache with TTL. Another replica or isolate never sees these entries. */
export function createMemoryDriver(now: () => number): CacheDriver {
  const entries = new Map<string, Entry>();

  function sweep(): number {
    const at = now();
    let removed = 0;
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= at) {
        entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    async set(key, value, ttlMs) {
      entries.delete(key);
      if (entries.size >= MAX_ENTRIES && sweep() === 0) {
        // Map iteration is insertion order, so the first key is the oldest write.
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }
      entries.set(key, { value, expiresAt: now() + ttlMs });
    },
    async delete(key) {
      entries.delete(key);
    },
    async deletePrefix(prefix) {
      for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
    },
    async prune() {
      return sweep();
    },
  };
}
