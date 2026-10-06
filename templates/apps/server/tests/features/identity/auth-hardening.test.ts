import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../../bootstrap/context.ts";
import { auditLogs } from "../../../features/audit/schema.ts";
import { createAuth } from "../../../features/identity/auth.ts";
import { users } from "../../../features/identity/schema.ts";
import { createSeededContext, testEnv } from "../../support/fixtures.ts";

let ctx: AppContext;

beforeEach(async () => {
  ctx = await createSeededContext();
});

const authUrl = (path: string) => `${testEnv.BETTER_AUTH_URL}/api/v1/auth${path}`;

function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const signUpRequest = (auth: ReturnType<typeof createAuth>, email: string) =>
  auth.handler(postJson(authUrl("/sign-up/email"), { email, password: "sandi-yang-panjang", name: "Baru" }));

const signInRequest = (auth: ReturnType<typeof createAuth>, ip?: string) =>
  auth.handler(
    postJson(
      authUrl("/sign-in/email"),
      { email: "tidak-ada@example.test", password: "sandi-yang-panjang" },
      ip ? { "x-forwarded-for": ip } : {},
    ),
  );

test("public sign-up is disabled unless AUTH_SIGNUP_ENABLED is true", async () => {
  const auth = createAuth({ ...testEnv, AUTH_SIGNUP_ENABLED: false }, ctx.db);
  const res = await signUpRequest(auth, "tertutup@example.test");
  expect(res.status).toBe(400);
  const rows = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, "tertutup@example.test"));
  expect(rows).toHaveLength(0);
});

test("sign-up enabled by config creates the user and records an audit event", async () => {
  const auth = createAuth({ ...testEnv, AUTH_SIGNUP_ENABLED: true }, ctx.db);
  const res = await signUpRequest(auth, "terbuka@example.test");
  expect(res.status).toBe(200);
  const { user } = (await res.json()) as { user: { id: string } };

  const logs = await ctx.db.select().from(auditLogs).where(eq(auditLogs.subjectId, user.id));
  expect(logs.map((log) => log.event)).toContain("user.created");
  expect(logs[0]?.subjectType).toBe("user");
});

test("auth endpoints are rate limited, and TRUST_PROXY decides which forwarded IP is trusted", async () => {
  const trusted = createAuth({ ...testEnv, AUTH_RATE_LIMIT_ENABLED: true, TRUST_PROXY: true }, ctx.db);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect((await signInRequest(trusted, "198.51.100.7")).status).not.toBe(429);
  }
  // The 4th attempt from the same forwarded IP is over the sign-in limit (3 per 10s)...
  expect((await signInRequest(trusted, "198.51.100.7")).status).toBe(429);
  // ...while another forwarded IP still has its own bucket because TRUST_PROXY trusts the header.
  expect((await signInRequest(trusted, "198.51.100.8")).status).not.toBe(429);

  const untrusted = createAuth({ ...testEnv, AUTH_RATE_LIMIT_ENABLED: true, TRUST_PROXY: false }, ctx.db);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect((await signInRequest(untrusted, "203.0.113.1")).status).not.toBe(429);
  }
  // The forwarded header is ignored, so both addresses share one bucket and the 4th call is refused.
  expect((await signInRequest(untrusted, "203.0.113.2")).status).toBe(429);
});

test("AUTH_RATE_LIMIT_ENABLED=false leaves the auth endpoints unlimited", async () => {
  const auth = createAuth({ ...testEnv, AUTH_RATE_LIMIT_ENABLED: false, TRUST_PROXY: true }, ctx.db);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    expect((await signInRequest(auth, "198.51.100.9")).status).not.toBe(429);
  }
});
