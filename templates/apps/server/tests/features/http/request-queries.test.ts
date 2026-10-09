import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createApp } from "@/http/app.ts";
import { setMaintenance, setMaintenanceClock } from "@/http/maintenance.ts";
import { createHttpFixture, createTestClient, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

beforeEach(async () => {
  setMaintenanceClock();
  api = await createHttpFixture();
});

const authority = { userId: null, traceId: "request-queries-test", label: "test" };

describe("database round trips per authenticated request", () => {
  test("the session is looked up once even though rate limit and policy both need it", async () => {
    const cookie = await api.signInAsOwner();
    const getSession = spyOn(api.ctx.auth.api, "getSession");
    const client = createTestClient(
      createApp({ ...api.ctx, env: { ...api.ctx.env, API_RATE_LIMIT_ENABLED: true, API_RATE_LIMIT_MAX: 100 } }),
      cookie,
    );

    expect((await client.api.v1.notifications["unread-count"].$get()).status).toBe(200);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  test("the maintenance flag is read once across apps rebuilt per request, then again after the TTL", async () => {
    let now = 1_000_000;
    setMaintenanceClock(() => now);
    const execute = spyOn(api.ctx.db, "execute");
    const reads = () => execute.mock.calls.filter(([q]) => JSON.stringify(q).includes("app_state")).length;

    // A Worker builds a fresh app per request; the cache must outlive it.
    for (let i = 0; i < 3; i++) await createTestClient(createApp(api.ctx)).api.v1.me.$get();
    expect(reads()).toBe(1);

    now += 2_001;
    await createTestClient(createApp(api.ctx)).api.v1.me.$get();
    expect(reads()).toBe(2);
  });

  test("setMaintenance is visible to the writing process immediately", async () => {
    await createTestClient(createApp(api.ctx)).api.v1.me.$get();
    await setMaintenance(api.ctx.db, { down: true }, authority);
    expect((await createTestClient(createApp(api.ctx)).api.v1.me.$get()).status).toBe(503);
  });
});
