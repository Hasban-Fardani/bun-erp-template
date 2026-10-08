import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { rowsOf } from "@/database/rows.ts";
import { createApp } from "@/http/app.ts";
import { hitApiRateLimit } from "@/http/helpers/api-rate-limit.ts";
import { createHttpFixture, createTestClient, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

beforeEach(async () => {
  api = await createHttpFixture();
});

const LIMITED = { API_RATE_LIMIT_ENABLED: true, API_RATE_LIMIT_WINDOW_SECONDS: 60 };

// slop-ok: the helper only exists so each test states just the limiter settings it varies.
function appWith(overrides: Record<string, unknown>) {
  return createApp({ ...api.ctx, env: { ...api.ctx.env, ...LIMITED, ...overrides } });
}

describe("API rate limiter", () => {
  test("request max+1 is answered 429 with Retry-After", async () => {
    const client = createTestClient(appWith({ API_RATE_LIMIT_MAX: 3 }));
    for (let i = 0; i < 3; i++) expect((await client.api.v1.me.$get()).status).toBe(401);

    const blocked = await client.api.v1.me.$get();
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    const body = (await blocked.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  test("the window rolls over and requests pass again", async () => {
    const client = createTestClient(appWith({ API_RATE_LIMIT_MAX: 1, API_RATE_LIMIT_WINDOW_SECONDS: 1 }));
    expect((await client.api.v1.me.$get()).status).toBe(401);
    await Bun.sleep(1100);
    expect((await client.api.v1.me.$get()).status).toBe(401);
  });

  test("authenticated callers are keyed by user id, not by shared IP", async () => {
    const cookie = await api.signInAsOwner();
    const app = appWith({ API_RATE_LIMIT_MAX: 2 });
    const anonymous = createTestClient(app);
    const owner = createTestClient(app, cookie);

    // Exhaust the anonymous (IP) bucket; the owner keeps an independent budget.
    for (let i = 0; i < 2; i++) await anonymous.api.v1.me.$get();
    expect((await anonymous.api.v1.me.$get()).status).toBe(429);
    expect((await owner.api.v1.me.$get()).status).toBe(200);
    expect((await owner.api.v1.me.$get()).status).toBe(200);
    expect((await owner.api.v1.me.$get()).status).toBe(429);
  });

  test("health and readiness probes are never limited", async () => {
    const client = createTestClient(appWith({ API_RATE_LIMIT_MAX: 1 }));
    for (let i = 0; i < 4; i++) {
      expect((await client.api.v1.health.$get()).status).toBe(200);
      expect((await client.api.v1.ready.$get()).status).toBe(200);
    }
  });

  test("a disabled limiter never answers 429 and writes no rows", async () => {
    const client = createTestClient(
      appWith({ API_RATE_LIMIT_MAX: 1, API_RATE_LIMIT_WINDOW_SECONDS: 60, API_RATE_LIMIT_ENABLED: false }),
    );
    for (let i = 0; i < 4; i++) expect((await client.api.v1.me.$get()).status).toBe(401);
    const rows = rowsOf<{ n: number }>(await api.ctx.db.execute(sql`select count(*)::int as n from api_rate_limits`));
    expect(rows[0]?.n).toBe(0);
  });

  test("x-forwarded-for picks the bucket only when TRUST_PROXY is on", async () => {
    const ip = (value: string) => ({ headers: { "x-forwarded-for": value } });
    const untrusted = createTestClient(appWith({ API_RATE_LIMIT_MAX: 1 }));
    await untrusted.api.v1.me.$get({}, ip("203.0.113.1"));
    expect((await untrusted.api.v1.me.$get({}, ip("203.0.113.2"))).status).toBe(429);

    const trusted = createTestClient(
      appWith({ API_RATE_LIMIT_MAX: 1, API_RATE_LIMIT_WINDOW_SECONDS: 60, TRUST_PROXY: true }),
    );
    await trusted.api.v1.me.$get({}, ip("203.0.113.1"));
    expect((await trusted.api.v1.me.$get({}, ip("203.0.113.2"))).status).toBe(401);
    expect((await trusted.api.v1.me.$get({}, ip("203.0.113.1"))).status).toBe(429);
  });
});

describe("fixed-window store", () => {
  test("one atomic upsert counts within a window and resets on the next", async () => {
    const hit = (nowMs: number) => hitApiRateLimit(api.ctx.db, { key: "k", windowSeconds: 10, nowMs });
    expect((await hit(1_000_000)).count).toBe(1);
    expect((await hit(1_001_000)).count).toBe(2);
    const next = await hit(1_010_000);
    expect(next.count).toBe(1);
    expect(next.retryAfterSeconds).toBe(10);
  });
});
