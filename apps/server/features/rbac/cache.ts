import type { PermissionKey } from "./statements.ts";

/**
 * Permission cache, keyed by user. Every authorized request used to run a three-table join
 * before it could even check a single permission; on a page that fires several calls, that
 * cost is paid repeatedly for data that changes only when an admin edits a role.
 *
 * Invalidation is explicit and must be called by every write path that can change access:
 * assigning or revoking a role, and editing a role's permissions. A TTL backs it up so a
 * missed invalidation degrades to staleness for at most one window instead of forever.
 */

const TTL_MS = 30_000;

type Entry = { permissions: readonly PermissionKey[]; expiresAt: number };

const cache = new Map<string, Entry>();

/** Counters used by tests to prove the cache is exercised, not just correct. */
export const cacheStats = { hits: 0, misses: 0 };

export function readCachedPermissions(userId: string): readonly PermissionKey[] | undefined {
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
