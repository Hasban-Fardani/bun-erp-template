import type { PermissionKey } from "./statements.ts";

/**
 * Permission cache, keyed by user. Every authorized request used to run a three-table join
 * before it could even check a single permission; on a page that fires several calls, that
 * cost is paid repeatedly for data that changes only when an admin edits a role.
 *
 * The database stays the source of truth. This Map is a per-process optimisation, so it is
 * explicit and optional: `PERMISSION_CACHE_ENABLED=false` turns it off (recommended for
 * Cloudflare Workers and multi-replica Bun, where an invalidation only reaches the process
 * that handled the write). The short TTL bounds staleness from a missed invalidation; it is
 * not a correctness mechanism. See docs/security.md and docs/deployment.md.
 *
 * Invalidation is explicit and must be called by every write path that can change access:
 * assigning or revoking a role, and editing a role's permissions. The TTL backs it up so a
 * missed invalidation degrades to staleness for at most one window instead of forever.
 */

const TTL_MS = 10_000;

type Entry = { permissions: readonly PermissionKey[]; expiresAt: number };

const cache = new Map<string, Entry>();

let enabled = true;

/** Runtime entrypoints call this once per process with `env.PERMISSION_CACHE_ENABLED`. */
export function configurePermissionCache(options: { enabled: boolean }): void {
  enabled = options.enabled;
  if (!enabled) cache.clear();
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

export function readCachedPermissions(userId: string): readonly PermissionKey[] | undefined {
  if (!enabled) return undefined;
  const hit = cache.get(userId);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(userId);
    cacheStats.misses += 1;
    return undefined;
  }
  cacheStats.hits += 1;
  return hit.permissions;
}

export function writeCachedPermissions(userId: string, permissions: readonly PermissionKey[]): void {
  if (!enabled) return;
  cacheStats.misses += 1;
  cache.set(userId, { permissions, expiresAt: Date.now() + TTL_MS });
}

/** Drops one user. Used whenever that user's role membership changes. */
export function invalidateUser(userId: string): void {
  cache.delete(userId);
}

/**
 * Drops every entry. Role permission edits affect an unknown set of users, so scoping this
 * would mean tracking role to user edges — more state, more ways to be wrong.
 */
export function invalidateAll(): void {
  cache.clear();
}

/** Test hook: a shared cache between test files would leak permissions across cases. */
export function resetPermissionCache(): void {
  cache.clear();
  cacheStats.hits = 0;
  cacheStats.misses = 0;
}
