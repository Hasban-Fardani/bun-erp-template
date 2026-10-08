import { afterEach, expect, setSystemTime, test } from "bun:test";
import {
  configurePermissionCache,
  permissionCacheEnabled,
  permissionCacheTtlMs,
  readCachedPermissions,
  resetPermissionCache,
  writeCachedPermissions,
} from "../../features/rbac/cache.ts";

afterEach(async () => {
  configurePermissionCache({ enabled: true });
  await resetPermissionCache();
  setSystemTime();
});

test("the cache is enabled by default with a short TTL", () => {
  expect(permissionCacheEnabled()).toBe(true);
  expect(permissionCacheTtlMs()).toBeLessThanOrEqual(10_000);
});

test("entries expire after the TTL instead of living for the process lifetime", async () => {
  await writeCachedPermissions("user-ttl", ["user.read"]);
  expect(await readCachedPermissions("user-ttl")).toEqual(["user.read"]);

  setSystemTime(new Date(Date.now() + permissionCacheTtlMs() + 1));
  expect(await readCachedPermissions("user-ttl")).toBeUndefined();
});

test("disabling clears entries and stops reads and writes", async () => {
  await writeCachedPermissions("user-off", ["user.read"]);
  configurePermissionCache({ enabled: false });
  expect(permissionCacheEnabled()).toBe(false);
  expect(await readCachedPermissions("user-off")).toBeUndefined();

  await writeCachedPermissions("user-off", ["audit.read"]);
  configurePermissionCache({ enabled: true });
  expect(await readCachedPermissions("user-off")).toBeUndefined();
});
