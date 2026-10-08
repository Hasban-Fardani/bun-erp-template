import type { Env } from "../../config/index.ts";
import type { Database } from "../../database/index.ts";
import { type Cache, createCache, type KvNamespaceLike } from "./index.ts";

/** Maps the validated environment onto a cache driver; `bindings` carries Worker bindings (KV). */
export function createCacheFromEnv(options: { env: Env; db: Database; bindings?: Record<string, unknown> }): Cache {
  const { env, db, bindings } = options;
  switch (env.CACHE_DRIVER) {
    case "memory":
      return createCache({ driver: "memory" });
    case "database":
      return createCache({ driver: "database", db });
    case "cloudflare-kv": {
      const kv = bindings?.[env.CACHE_KV_BINDING];
      if (!kv || typeof kv !== "object") {
        throw new Error(`CACHE_DRIVER=cloudflare-kv needs the "${env.CACHE_KV_BINDING}" KV binding`);
      }
      return createCache({ driver: "cloudflare-kv", kv: kv as KvNamespaceLike });
    }
  }
}
