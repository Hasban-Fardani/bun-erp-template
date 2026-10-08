import { beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "@/http/app.ts";
import { getMaintenance, setMaintenance } from "@/http/maintenance.ts";
import { createHttpFixture, createTestClient, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;

beforeEach(async () => {
  api = await createHttpFixture();
});

const authority = { userId: null, traceId: "maintenance-test", label: "test" };

describe("maintenance mode", () => {
  test("down answers 503 with the message, up restores normal answers", async () => {
    const client = createTestClient(createApp(api.ctx));
    expect((await client.api.v1.me.$get()).status).toBe(401);

    await setMaintenance(api.ctx.db, { down: true, message: "Back at 10:00" }, authority);
    const down = await createTestClient(createApp(api.ctx)).api.v1.me.$get();
    expect(down.status).toBe(503);
    const body = (await down.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).toBe("Back at 10:00");
    expect(down.headers.get("retry-after")).not.toBeNull();

    await setMaintenance(api.ctx.db, { down: false }, authority);
    expect((await createTestClient(createApp(api.ctx)).api.v1.me.$get()).status).toBe(401);
  });

  test("health and readiness always answer 200 while down", async () => {
    await setMaintenance(api.ctx.db, { down: true }, authority);
    const client = createTestClient(createApp(api.ctx));
    expect((await client.api.v1.health.$get()).status).toBe(200);
    expect((await client.api.v1.ready.$get()).status).toBe(200);
  });

  test("a session holding app.maintenance_bypass keeps working (owner), others get 503", async () => {
    const cookie = await api.signInAsOwner();
    await setMaintenance(api.ctx.db, { down: true }, authority);
    const app = createApp(api.ctx);

    expect((await createTestClient(app, cookie).api.v1.me.$get()).status).toBe(200);
    expect((await createTestClient(app).api.v1.me.$get()).status).toBe(503);
  });

  test("a signed-in user without the bypass permission is blocked", async () => {
    const { createFixtureUser } = await import("../../support/fixtures.ts");
    await createFixtureUser(api.ctx.db, "plain@example.test");
    const signIn = await api.app.request("/api/v1/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "plain@example.test", password: "sandi-yang-panjang" }),
    });
    const cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] as string;
    await setMaintenance(api.ctx.db, { down: true }, authority);
    expect((await createTestClient(createApp(api.ctx), cookie).api.v1.me.$get()).status).toBe(503);
  });

  test("the state lives in app_state and survives a new app instance", async () => {
    await setMaintenance(api.ctx.db, { down: true, message: "Planned" }, authority);
    expect(await getMaintenance(api.ctx.db)).toEqual({ down: true, message: "Planned" });
    await setMaintenance(api.ctx.db, { down: false }, authority);
    expect((await getMaintenance(api.ctx.db)).down).toBe(false);
  });

  test("a running app picks the change up within the cache TTL", async () => {
    const app = createApp(api.ctx);
    const client = createTestClient(app);
    expect((await client.api.v1.me.$get()).status).toBe(401);
    // Another process wrote the row; this process learns about it once its short cache expires.
    await setMaintenance(api.ctx.db, { down: true }, authority);
    await Bun.sleep(3200);
    expect((await client.api.v1.me.$get()).status).toBe(503);
  });
});
