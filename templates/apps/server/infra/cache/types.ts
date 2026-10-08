export type CacheDriverName = "memory" | "database" | "cloudflare-kv";

/**
 * Raw storage behind the facade. Values are already JSON strings; `ttlMs` is validated by the
 * facade. A driver never throws for a missing or expired key, it returns `undefined`.
 */
export interface CacheDriver {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  /** Removes expired rows; drivers whose store expires entries itself return 0. */
  prune(): Promise<number>;
}

/** Subset of the Workers KV namespace the kv driver uses, so tests need no Workers runtime. */
export interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: {
    prefix?: string;
    cursor?: string;
  }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}
