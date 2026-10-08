import type { Database } from "../../database/index.ts";
import { createDatabaseDriver } from "./database.ts";
import { createKvDriver } from "./kv.ts";
import { createMemoryDriver } from "./memory.ts";
import type { CacheDriver, CacheDriverName, KvNamespaceLike } from "./types.ts";

export type { CacheDriver, CacheDriverName, KvNamespaceLike } from "./types.ts";

const MAX_KEY_LENGTH = 200;
const MAX_TTL_MS = 365 * 24 * 60 * 60_000;

/**
 * Cache facade over one of three drivers. A cached value is an optimisation: every caller must be
 * able to recompute it from the database, and a miss must never change behaviour. Values are
 * JSON-serialisable; `undefined` means "not cached", so `undefined` itself cannot be stored.
 */
export interface Cache {
  /** The driver behind this facade; callers that cannot tolerate staleness check it. */
  readonly driver: CacheDriverName;
  get<T = unknown>(key: string): Promise<T | undefined>;
  /** `ttlMs` is a positive integer number of milliseconds. */
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
  forget(key: string): Promise<void>;
  /** Returns the cached value, or computes, stores and returns it. A failing `compute` caches nothing. */
  remember<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T>;
  /** A view whose keys are prefixed with `name:`; `clear()` drops only that namespace. */
  namespace(name: string): NamespacedCache;
  /** Deletes expired rows (database driver); other drivers return 0. */
  prune(): Promise<number>;
}

export interface NamespacedCache extends Omit<Cache, "namespace" | "prune" | "driver"> {
  clear(): Promise<void>;
}

export type CreateCacheOptions =
  | { driver: "memory"; now?: () => number }
  | { driver: "database"; db?: Database; now?: () => number }
  | { driver: "cloudflare-kv"; kv?: KvNamespaceLike; now?: () => number };

export function createCache(options: CreateCacheOptions): Cache {
  const now = options.now ?? (() => Date.now());
  return createFacade(selectDriver(options, now), options.driver, "");
}

function selectDriver(options: CreateCacheOptions, now: () => number): CacheDriver {
  switch (options.driver) {
    case "memory":
      return createMemoryDriver(now);
    case "database":
      if (!options.db) throw new Error("The database cache driver needs a database handle");
      return createDatabaseDriver(options.db);
    case "cloudflare-kv":
      if (!options.kv) throw new Error("The cloudflare-kv cache driver needs the CACHE_KV binding");
      return createKvDriver(options.kv, now);
  }
}

function assertKey(key: string): void {
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw new RangeError(`Cache keys must be 1-${MAX_KEY_LENGTH} characters`);
  }
}

function assertTtl(ttlMs: number): void {
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_TTL_MS) {
    throw new RangeError("Cache ttlMs must be a positive integer number of milliseconds");
  }
}

function createFacade(driver: CacheDriver, driverName: CacheDriverName, prefix: string): Cache & NamespacedCache {
  const full = (key: string): string => {
    assertKey(key);
    return prefix + key;
  };

  const facade: Cache & NamespacedCache = {
    driver: driverName,
    async get<T>(key: string): Promise<T | undefined> {
      const raw = await driver.get(full(key));
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // A corrupt entry is a miss, not an outage.
        return undefined;
      }
    },
    async set(key, value, ttlMs) {
      assertTtl(ttlMs);
      const serialised = JSON.stringify(value);
      if (serialised === undefined) throw new TypeError("Cache values must be JSON-serialisable and not undefined");
      await driver.set(full(key), serialised, ttlMs);
    },
    async forget(key) {
      await driver.delete(full(key));
    },
    async remember<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
      assertTtl(ttlMs);
      const hit = await facade.get<T>(key);
      if (hit !== undefined) return hit;
      const value = await compute();
      await facade.set(key, value, ttlMs);
      return value;
    },
    namespace(name) {
      if (!/^[a-z][a-z0-9_.-]{0,59}$/.test(name)) throw new RangeError("Cache namespaces are lowercase identifiers");
      return createFacade(driver, driverName, `${prefix}${name}:`);
    },
    async clear() {
      // Clearing the root would also wipe every namespace, so it is only offered on namespaced views.
      if (prefix === "") throw new Error("clear() is only available on a namespace");
      await driver.deletePrefix(prefix);
    },
    prune: () => driver.prune(),
  };
  return facade;
}
