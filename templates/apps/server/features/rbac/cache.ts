import { type Cache, createCache, type NamespacedCache } from "../../infra/cache/index.ts";
import type { PermissionKey } from "./statements.ts";

/**
 * Permission cache, keyed by user, built on the cache facade (infra/cache). Every authorized
 * request used to run a three-table join before it could even check a single permission; on a
 * page that fires several calls, that cost is paid repeatedly for data that changes only when an
 * admin edits a role.
 *
 * The database stays the source of truth. With the default `memory` driver this is a per-process
 * optimisation, so an invalidation only reaches the process that handled the write; the `database`
 * driver shares entries (and invalidations) across replicas and Worker isolates.
 * `PERMISSION_CACHE_ENABLED=false` turns the cache off entirely. Eventually consistent drivers
 * (`cloudflare-kv`) run uncached: a revoked permission must not survive on a stale edge copy.
 * The short TTL bounds staleness from a missed invalidation; it is not a correctness mechanism, and
 * a cache store failure degrades to a miss instead of failing the request or the committed write.
 *
 * Invalidation is explicit and must be called by every write path that can change access:
 * assigning or revoking a role, and editing a role's permissions. The TTL backs it up so a
 * missed invalidation degrades to staleness for at most one window instead of forever.
 */

const TTL_MS = 10_000;
const NAMESPACE = "permissions";

let enabled = true;
let store: NamespacedCache = createCache({ driver: "memory" }).namespace(NAMESPACE);

/**
 * Runtime entrypoints call this once per process with `env.PERMISSION_CACHE_ENABLED` and the
 * context's cache facade. Without `cache` the current backing store is kept.
 */
export function configurePermissionCache(options: { enabled: boolean; cache?: Cache }): void {
  enabled = options.enabled;
  if (options.cache) {
    // Eventually consistent stores cannot back access decisions: run uncached instead of failing boot.
    if (options.cache.driver === "cloudflare-kv") enabled = false;
    else store = options.cache.namespace(NAMESPACE);
  }
  // Turning the cache off must not leave entries that a later re-enable would serve.
  if (!enabled) void store.clear().catch(() => {});
}

export function permissionCacheEnabled(): boolean {
  return enabled;
}

/** Exposed so tests and docs can state the staleness window without duplicating the constant. */
export function permissionCacheTtlMs(): number {
  return TTL_MS;
}

/** Counters used by tests to prove the cache is exercised, not just correct. */
export const cacheStats = { hits: 0, misses: 0 };

export async function readCachedPermissions(userId: string): Promise<readonly PermissionKey[] | undefined> {
  if (!enabled) return undefined;
  // A failing store is a miss: the join in permissionsForUser is always correct, just slower.
  const hit = await store.get<PermissionKey[]>(userId).catch(() => undefined);
  if (hit === undefined) {
    cacheStats.misses += 1;
    return undefined;
  }
  cacheStats.hits += 1;
  return hit;
}

export async function writeCachedPermissions(userId: string, permissions: readonly PermissionKey[]): Promise<void> {
  if (!enabled) return;
  await store.set(userId, permissions, TTL_MS).catch(() => {});
}

/** Drops one user. Used whenever that user's role membership changes. Never throws: the TTL bounds a miss. */
export async function invalidateUser(userId: string): Promise<void> {
  await store.forget(userId).catch(() => {});
}

/**
 * Drops every entry. Role permission edits affect an unknown set of users, so scoping this
 * would mean tracking role to user edges — more state, more ways to be wrong.
 */
export async function invalidateAll(): Promise<void> {
  await store.clear().catch(() => {});
}

/** Test hook: a shared cache between test files would leak permissions across cases. */
export async function resetPermissionCache(): Promise<void> {
  await invalidateAll();
  cacheStats.hits = 0;
  cacheStats.misses = 0;
}
