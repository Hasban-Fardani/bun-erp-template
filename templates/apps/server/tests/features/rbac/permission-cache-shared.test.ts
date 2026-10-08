import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
  configurePermissionCache,
  invalidateAll,
  invalidateUser,
  permissionCacheEnabled,
  readCachedPermissions,
  resetPermissionCache,
  writeCachedPermissions,
} from "@/features/rbac/cache.ts";
import { type Cache, createCache } from "@/infra/cache/index.ts";
import { createTestContext } from "../../support/fixtures.ts";

async function databaseCache(): Promise<Cache> {
  const ctx = await createTestContext();
  return createCache({ driver: "database", db: ctx.db });
}

/** Points the process-wide permission cache at one "replica": its own facade over the shared table. */
function actAs(cache: Cache, enabled = true): void {
  configurePermissionCache({ enabled, cache });
}

beforeEach(async () => {
  const ctx = await createTestContext();
  await ctx.db.execute(sql`delete from cache_entries`);
});

afterEach(async () => {
  configurePermissionCache({ enabled: true, cache: createCache({ driver: "memory" }) });
  await resetPermissionCache();
});

describe("permission cache on the database driver", () => {
  test("an invalidation through one replica is visible to another", async () => {
    const replicaA = await databaseCache();
    const replicaB = await databaseCache();

    actAs(replicaA);
    await writeCachedPermissions("user-1", ["user.read"]);
    actAs(replicaB);
    expect(await readCachedPermissions("user-1")).toEqual(["user.read"]);

    await invalidateUser("user-1");
    actAs(replicaA);
    expect(await readCachedPermissions("user-1")).toBeUndefined();

    await writeCachedPermissions("user-1", ["user.read"]);
    await writeCachedPermissions("user-2", ["audit.read"]);
    actAs(replicaB);
    await invalidateAll();
    actAs(replicaA);
    expect(await readCachedPermissions("user-1")).toBeUndefined();
    expect(await readCachedPermissions("user-2")).toBeUndefined();
  });

  test("permission entries do not collide with other cache keys and survive an unrelated namespace clear", async () => {
    const cache = await databaseCache();
    actAs(cache);
    await writeCachedPermissions("user-1", ["user.read"]);
    await cache.set("user-1", "other", 60_000);
    await cache.namespace("reports").clear();
    expect(await readCachedPermissions("user-1")).toEqual(["user.read"]);
    expect(await cache.get<unknown>("user-1")).toBe("other");
  });

  test("a disabled cache neither reads nor writes through the shared store", async () => {
    const cache = await databaseCache();
    actAs(cache, false);
    await writeCachedPermissions("user-1", ["user.read"]);
    actAs(cache);
    expect(await readCachedPermissions("user-1")).toBeUndefined();
  });

  test("an eventually consistent store runs uncached instead of serving stale grants", async () => {
    const kv = {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true }),
    };
    configurePermissionCache({ enabled: true, cache: createCache({ driver: "cloudflare-kv", kv }) });
    expect(permissionCacheEnabled()).toBe(false);
  });

  test("a failing store degrades to a miss and never fails the caller", async () => {
    const broken: Cache = {
      ...(await databaseCache()),
      driver: "database",
      namespace: () => ({
        get: async () => {
          throw new Error("store down");
        },
        set: async () => {
          throw new Error("store down");
        },
        forget: async () => {
          throw new Error("store down");
        },
        remember: async () => {
          throw new Error("store down");
        },
        clear: async () => {
          throw new Error("store down");
        },
      }),
    };
    actAs(broken);
    await writeCachedPermissions("user-1", ["user.read"]);
    expect(await readCachedPermissions("user-1")).toBeUndefined();
    await invalidateUser("user-1");
    await invalidateAll();
  });
});
