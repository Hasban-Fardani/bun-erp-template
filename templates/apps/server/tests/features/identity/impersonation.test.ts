import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { auditLogs } from "@/features/audit/schema.ts";
import { sessions } from "@/features/identity/schema.ts";
import { createApp } from "@/http/app.ts";
import { createFixtureUser, createHttpFixture, createTestClient, type HttpFixture } from "../../support/fixtures.ts";

let api: HttpFixture;
let staffId: string;

beforeEach(async () => {
  api = await createHttpFixture();
  await api.signInAsOwner();
  staffId = (await createFixtureUser(api.ctx.db, "staff@example.test")).id;
});

afterAll(async () => {
  await api?.close();
});

const IMPERSONATION_COOKIE = "loom_impersonation";

type Me = { data: { userId: string; email: string; impersonation: null | { by: { email: string } } } };

/** Starts an impersonation and returns the cookie header a browser would send afterwards. */
async function start(targetId: string, cookie = api.cookie): Promise<{ status: number; cookie: string }> {
  const res = await createTestClient(api.app, cookie).api.v1.users[":id"].impersonate.$post({
    param: { id: targetId },
  });
  const set = res.headers.get("set-cookie") ?? "";
  const token = new RegExp(`${IMPERSONATION_COOKIE}=([^;]+)`).exec(set)?.[1];
  return { status: res.status, cookie: token ? `${cookie}; ${IMPERSONATION_COOKIE}=${token}` : cookie };
}

async function me(cookie: string): Promise<{ status: number; body: Me }> {
  const res = await createTestClient(api.app, cookie).api.v1.me.$get();
  return { status: res.status, body: (await res.json()) as Me };
}

async function makeStaffSession(email: string): Promise<string> {
  const res = await api.app.request("/api/v1/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "sandi-yang-panjang" }),
  });
  return (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
}

describe("impersonation policy (I1)", () => {
  test("401 without a session", async () => {
    const res = await createTestClient(api.app).api.v1.users[":id"].impersonate.$post({ param: { id: staffId } });
    expect(res.status).toBe(401);
  });

  test("403 without the user.impersonate permission", async () => {
    const staffCookie = await makeStaffSession("staff@example.test");
    const other = (await createFixtureUser(api.ctx.db, "other@example.test")).id;
    expect((await start(other, staffCookie)).status).toBe(403);
  });

  test("403 for impersonating yourself", async () => {
    const mine = (await me(api.cookie)).body.data.userId;
    expect((await start(mine)).status).toBe(403);
  });

  test("403 for a target holding the owner role", async () => {
    const second = (await createFixtureUser(api.ctx.db, "owner2@example.test")).id;
    const assigned = await api.client.api.v1.users[":id"].roles.$post({
      param: { id: second },
      json: { roleKey: "owner" },
    });
    expect(assigned.status).toBe(200);
    expect((await start(second)).status).toBe(403);
  });

  test("403 for a nested impersonation", async () => {
    const first = await start(staffId);
    expect(first.status).toBe(200);
    const other = (await createFixtureUser(api.ctx.db, "third@example.test")).id;
    expect((await start(other, first.cookie)).status).toBe(403);
  });

  test("404 for an unknown user", async () => {
    expect((await start("019b0000-0000-7000-8000-000000000000")).status).toBe(404);
  });

  test("403 when IMPERSONATION_ENABLED is false", async () => {
    const app = createApp({ ...api.ctx, env: { ...api.ctx.env, IMPERSONATION_ENABLED: false } });
    const res = await createTestClient(app, api.cookie).api.v1.users[":id"].impersonate.$post({
      param: { id: staffId },
    });
    expect(res.status).toBe(403);
  });

  test("200 for the owner on a regular user", async () => {
    expect((await start(staffId)).status).toBe(200);
  });
});

describe("impersonation session (I2)", () => {
  test("start acts as the target, stop restores the original actor", async () => {
    const started = await start(staffId);
    const asTarget = await me(started.cookie);
    expect(asTarget.body.data.email).toBe("staff@example.test");
    expect(asTarget.body.data.impersonation?.by.email).toBe("admin@example.test");

    const stop = await createTestClient(api.app, started.cookie).api.v1.impersonation.stop.$post();
    expect(stop.status).toBe(200);
    expect(stop.headers.get("set-cookie") ?? "").toContain(`${IMPERSONATION_COOKIE}=;`);

    // The browser drops the cleared cookie; the original session is untouched.
    const restored = await me(api.cookie);
    expect(restored.body.data.email).toBe("admin@example.test");
    expect(restored.body.data.impersonation).toBeNull();
    // The old impersonation token is dead even if replayed.
    expect((await me(started.cookie)).status).toBe(401);
  });

  test("stop without an active impersonation is a 404; anonymous is a 401", async () => {
    expect((await createTestClient(api.app, api.cookie).api.v1.impersonation.stop.$post()).status).toBe(404);
    expect((await createTestClient(api.app).api.v1.impersonation.stop.$post()).status).toBe(401);
  });

  test("TTL expiry is a 401 that clears the cookie; the original session stays valid", async () => {
    const started = await start(staffId);
    await api.ctx.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, staffId));
    const expired = await createTestClient(api.app, started.cookie).api.v1.me.$get();
    expect(expired.status).toBe(401);
    expect(expired.headers.get("set-cookie") ?? "").toContain(`${IMPERSONATION_COOKIE}=;`);
    expect((await me(api.cookie)).body.data.email).toBe("admin@example.test");
  });

  test("the session expires at IMPERSONATION_TTL_MINUTES", async () => {
    const before = Date.now();
    await start(staffId);
    const [row] = await api.ctx.db.select().from(sessions).where(eq(sessions.userId, staffId));
    const minutes = ((row?.expiresAt.getTime() ?? 0) - before) / 60_000;
    expect(minutes).toBeGreaterThan(59);
    expect(minutes).toBeLessThan(61);
    expect(row?.impersonatedBy).not.toBeNull();
  });

  test("the impersonation dies with the impersonator's own session", async () => {
    const started = await start(staffId);
    const adminOnly = started.cookie.split(";")[0] as string;
    const tokenOnly = started.cookie.split("; ")[1] as string;
    // Impersonation cookie without the admin session: no identity.
    expect((await me(tokenOnly)).status).toBe(401);
    expect((await me(adminOnly)).status).toBe(200);
  });

  test("password, email, sessions and 2FA cannot be changed while impersonating", async () => {
    const started = await start(staffId);
    for (const path of [
      "change-password",
      "change-email",
      "revoke-sessions",
      "revoke-other-sessions",
      "two-factor/enable",
    ]) {
      const res = await api.app.request(`/api/v1/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: started.cookie },
        body: "{}",
      });
      expect(res.status).toBe(403);
    }
  });
});

describe("impersonation audit (I3)", () => {
  test("start and stop are audit events", async () => {
    const started = await start(staffId);
    await createTestClient(api.app, started.cookie).api.v1.impersonation.stop.$post();
    const events = (await api.ctx.db.select().from(auditLogs)).map((r) => r.event);
    expect(events).toContain("impersonation.started");
    expect(events).toContain("impersonation.stopped");
  });

  test("a mutation during impersonation records the target as actor and the impersonator", async () => {
    const editor = (await (
      await api.client.api.v1.roles.$post({ json: { key: "editor", name: "Editor" } })
    ).json()) as {
      data: { id: string };
    };
    await api.client.api.v1.roles[":id"].permissions.$put({
      param: { id: editor.data.id },
      json: { permissions: ["user.update"] },
    });
    await api.client.api.v1.users[":id"].roles.$post({ param: { id: staffId }, json: { roleKey: "editor" } });
    const admin = (await me(api.cookie)).body.data.userId;

    const started = await start(staffId);
    const res = await createTestClient(api.app, started.cookie).api.v1.users[":id"].$patch({
      param: { id: staffId },
      json: { name: "Renamed" },
    });
    expect(res.status).toBe(200);

    const [row] = await api.ctx.db.select().from(auditLogs).where(eq(auditLogs.event, "user.updated"));
    expect(row?.actorId).toBe(staffId);
    expect(row?.actorLabel).toBe("staff@example.test");
    expect(row?.impersonatorId).toBe(admin);
    expect(row?.impersonatorLabel).toBe("admin@example.test");
  });

  test("a normal mutation leaves impersonator_id empty", async () => {
    await api.client.api.v1.users[":id"].$patch({ param: { id: staffId }, json: { name: "Renamed" } });
    const [row] = await api.ctx.db.select().from(auditLogs).where(eq(auditLogs.event, "user.updated"));
    expect(row?.impersonatorId).toBeNull();
  });
});

describe("impersonation routes pass csrfProtection", () => {
  const ownOrigin = () => new URL(api.ctx.env.APP_URL).origin;
  const FOREIGN_ORIGIN = "https://evil.example.test";

  test("start accepts a matching Origin and refuses a foreign one with 403", async () => {
    const client = createTestClient(api.app, api.cookie).api.v1.users[":id"].impersonate;

    const foreign = await client.$post({ param: { id: staffId } }, { headers: { origin: FOREIGN_ORIGIN } });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get("set-cookie") ?? "").not.toContain(IMPERSONATION_COOKIE);

    const own = await client.$post({ param: { id: staffId } }, { headers: { origin: ownOrigin() } });
    expect(own.status).toBe(200);
  });

  test("stop accepts a matching Origin and refuses a foreign one with 403", async () => {
    const started = await start(staffId);
    const client = createTestClient(api.app, started.cookie).api.v1.impersonation.stop;

    const foreign = await client.$post(undefined, { headers: { origin: FOREIGN_ORIGIN } });
    expect(foreign.status).toBe(403);
    expect((await me(started.cookie)).body.data.impersonation).not.toBeNull();

    const own = await client.$post(undefined, { headers: { origin: ownOrigin() } });
    expect(own.status).toBe(200);
  });
});
