import type { CacheDriver, KvNamespaceLike } from "./types.ts";

/** Workers KV rejects `expirationTtl` below 60 seconds. */
const KV_MIN_TTL_SECONDS = 60;

type Envelope = { v: string; e: number };

/**
 * Cloudflare KV cache. KV is eventually consistent (a write can take up to a minute to be seen in
 * other locations), so use it for data that tolerates staleness, never for access decisions.
 * The envelope carries a logical expiry because the native minimum TTL is 60 s.
 */
export function createKvDriver(kv: KvNamespaceLike, now: () => number, keyPrefix = "cache:"): CacheDriver {
  return {
    async get(key) {
      const raw = await kv.get(keyPrefix + key);
      if (raw === null) return undefined;
      try {
        const envelope = JSON.parse(raw) as Envelope;
        if (typeof envelope.v !== "string" || typeof envelope.e !== "number") return undefined;
        if (envelope.e <= now()) return undefined;
        return envelope.v;
      } catch {
        return undefined;
      }
    },
    async set(key, value, ttlMs) {
      const envelope: Envelope = { v: value, e: now() + ttlMs };
      await kv.put(keyPrefix + key, JSON.stringify(envelope), {
        expirationTtl: Math.max(KV_MIN_TTL_SECONDS, Math.ceil(ttlMs / 1_000)),
      });
    },
    async delete(key) {
      await kv.delete(keyPrefix + key);
    },
    async deletePrefix(prefix) {
      let cursor: string | undefined;
      do {
        const page = await kv.list({ prefix: keyPrefix + prefix, ...(cursor ? { cursor } : {}) });
        for (const { name } of page.keys) await kv.delete(name);
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
    },
    async prune() {
      return 0;
    },
  };
}
