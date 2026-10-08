import { beforeEach, describe, expect, test } from "bun:test";
import { createUuid } from "@bun-erp/utils";
import { sql } from "drizzle-orm";
import { rowsOf } from "@/database/rows.ts";
import { type Cache, type CacheDriverName, createCache, type KvNamespaceLike } from "@/infra/cache/index.ts";
import { createTestContext } from "../../support/fixtures.ts";

/** Minimal KV double with the real contract: keys expire on their own, `expirationTtl` is at least 60 s. */
function fakeKv(clock: { now: number }) {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  const ttls: number[] = [];
  const kv: KvNamespaceLike = {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && entry.expiresAt <= clock.now) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key, value, options) {
      const ttl = options?.expirationTtl;
      if (ttl !== undefined && ttl < 60) throw new Error("KV expirationTtl must be at least 60 seconds");
      if (ttl !== undefined) ttls.push(ttl);
      store.set(key, { value, expiresAt: ttl === undefined ? null : clock.now + ttl * 1000 });
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix, cursor }) {
      void cursor;
      const keys = [...store.keys()].filter((name) => name.startsWith(prefix ?? "")).map((name) => ({ name }));
      return { keys, list_complete: true as const };
    },
  };
  return { kv, ttls };
}

type Harness = { cache: Cache; advance(ms: number): Promise<void> };

async function harness(driver: CacheDriverName): Promise<Harness> {
  const clock = { now: Date.now() };
  const now = () => clock.now;
  if (driver === "memory") {
    return {
      cache: createCache({ driver, now }),
      advance: async (ms) => {
        clock.now += ms;
      },
    };
  }
  if (driver === "cloudflare-kv") {
    const { kv } = fakeKv(clock);
    return {
      cache: createCache({ driver, kv, now }),
      advance: async (ms) => {
        clock.now += ms;
      },
    };
  }
  const ctx = await createTestContext();
  await ctx.db.execute(sql`delete from cache_entries`);
  // The database owns time for this driver, so expiry is observed by really waiting.
  return { cache: createCache({ driver, db: ctx.db }), advance: (ms) => Bun.sleep(ms) };
}

for (const driver of ["memory", "database", "cloudflare-kv"] as const) {
  describe(`cache contract: ${driver}`, () => {
    let h: Harness;
    // The database driver measures expiry on the database clock, so its TTLs are real and short.
    const short = driver === "database" ? 60 : 1_000;
    const afterShort = driver === "database" ? 120 : 1_500;

    beforeEach(async () => {
      h = await harness(driver);
    });

    test("get returns undefined for a missing key", async () => {
      expect(await h.cache.get<unknown>(`missing-${createUuid()}`)).toBeUndefined();
    });

    test("set then get round-trips JSON values", async () => {
      await h.cache.set("a", { n: 1, list: ["x", null], nested: { ok: true } }, 60_000);
      expect(await h.cache.get<unknown>("a")).toEqual({ n: 1, list: ["x", null], nested: { ok: true } });
      await h.cache.set("zero", 0, 60_000);
      expect(await h.cache.get<unknown>("zero")).toBe(0);
      await h.cache.set("empty", "", 60_000);
      expect(await h.cache.get<unknown>("empty")).toBe("");
    });

    test("set overwrites and resets the ttl", async () => {
      await h.cache.set("k", 1, short);
      await h.cache.set("k", 2, 60_000);
      await h.advance(afterShort);
      expect(await h.cache.get<unknown>("k")).toBe(2);
    });

    test("an entry is gone after its ttl", async () => {
      await h.cache.set("ttl", "v", short);
      expect(await h.cache.get<unknown>("ttl")).toBe("v");
      await h.advance(afterShort);
      expect(await h.cache.get<unknown>("ttl")).toBeUndefined();
    });

    test("forget removes one key and leaves the others", async () => {
      await h.cache.set("one", 1, 60_000);
      await h.cache.set("two", 2, 60_000);
      await h.cache.forget("one");
      expect(await h.cache.get<unknown>("one")).toBeUndefined();
      expect(await h.cache.get<unknown>("two")).toBe(2);
    });

    test("remember computes once, then serves the cached value", async () => {
      let calls = 0;
      const compute = async () => {
        calls += 1;
        return { calls };
      };
      expect(await h.cache.remember("r", 60_000, compute)).toEqual({ calls: 1 });
      expect(await h.cache.remember("r", 60_000, compute)).toEqual({ calls: 1 });
      expect(calls).toBe(1);
      await h.cache.forget("r");
      expect(await h.cache.remember("r", 60_000, compute)).toEqual({ calls: 2 });
    });

    test("remember does not cache a failure", async () => {
      await expect(
        h.cache.remember("boom", 60_000, async () => {
          throw new Error("nope");
        }),
      ).rejects.toThrow("nope");
      expect(await h.cache.remember("boom", 60_000, async () => "ok")).toBe("ok");
    });

    test("a namespace isolates keys and clears only itself", async () => {
      const left = h.cache.namespace("left");
      const right = h.cache.namespace("right");
      await left.set("k", "L", 60_000);
      await right.set("k", "R", 60_000);
      expect(await left.get<unknown>("k")).toBe("L");
      expect(await right.get<unknown>("k")).toBe("R");
      await left.clear();
      expect(await left.get<unknown>("k")).toBeUndefined();
      expect(await right.get<unknown>("k")).toBe("R");
    });

    test("rejects a non-positive or fractional ttl and an empty key", async () => {
      await expect(h.cache.set("k", 1, 0)).rejects.toThrow(RangeError);
      await expect(h.cache.set("k", 1, 1.5)).rejects.toThrow(RangeError);
      await expect(h.cache.set("", 1, 1_000)).rejects.toThrow(RangeError);
    });
  });
}

describe("cache driver specifics", () => {
  test("the database driver shares entries between two instances", async () => {
    const ctx = await createTestContext();
    const a = createCache({ driver: "database", db: ctx.db });
    const b = createCache({ driver: "database", db: ctx.db });
    await a.set("shared", { v: 1 }, 60_000);
    expect(await b.get<unknown>("shared")).toEqual({ v: 1 });
    await b.forget("shared");
    expect(await a.get<unknown>("shared")).toBeUndefined();
  });

  test("the database driver prunes expired rows", async () => {
    const ctx = await createTestContext();
    await ctx.db.execute(sql`delete from cache_entries`);
    const cache = createCache({ driver: "database", db: ctx.db });
    await cache.set("old", 1, 20);
    await cache.set("live", 2, 60_000);
    // Expiry is judged by the database clock, so poll instead of trusting one sleep under load.
    let removed = 0;
    for (let attempt = 0; attempt < 20 && removed === 0; attempt += 1) {
      await Bun.sleep(50);
      removed = await cache.prune();
    }
    expect(removed).toBe(1);
    expect(await cache.get<unknown>("live")).toBe(2);
    const rows = await ctx.db.execute(sql`select key from cache_entries`);
    expect(rowsOf<{ key: string }>(rows).map((row) => row.key)).toEqual(["live"]);
  });

  test("the kv driver clamps the native ttl to 60 s but still honours a shorter logical ttl", async () => {
    const clock = { now: Date.now() };
    const { kv, ttls } = fakeKv(clock);
    const cache = createCache({ driver: "cloudflare-kv", kv, now: () => clock.now });
    await cache.set("short", "v", 10_000);
    expect(ttls).toEqual([60]);
    expect(await cache.get<unknown>("short")).toBe("v");
    clock.now += 11_000;
    expect(await cache.get<unknown>("short")).toBeUndefined();
  });

  test("the kv driver refuses to start without a binding", () => {
    expect(() => createCache({ driver: "cloudflare-kv" })).toThrow(/CACHE_KV/);
  });

  test("the database driver refuses to start without a database", () => {
    expect(() => createCache({ driver: "database" })).toThrow(/database/i);
  });
});
