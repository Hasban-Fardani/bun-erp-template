import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { AppContext } from "@/bootstrap/context.ts";
import { rateLimits } from "@/database/rate-limit.ts";
import { createAuth } from "@/features/identity/auth.ts";
import { createSeededContext, testEnv } from "../../support/fixtures.ts";

let ctx: AppContext;

beforeEach(async () => {
  ctx = await createSeededContext();
});

const signIn = (auth: ReturnType<typeof createAuth>, ip: string) =>
  auth.handler(
    new Request(`${testEnv.BETTER_AUTH_URL}/api/v1/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "tidak-ada@example.test", password: "sandi-yang-panjang" }),
    }),
  );

test("rate-limit counters are shared through the database, not per-process memory", async () => {
  const auth = createAuth({ ...testEnv, AUTH_RATE_LIMIT_ENABLED: true, TRUST_PROXY: true }, ctx.db);
  const ip = "198.51.100.50";

  expect((await signIn(auth, ip)).status).not.toBe(429);

  // The counter is a row any other isolate or replica can read; in-memory storage leaves this empty.
  const rows = await ctx.db.select().from(rateLimits);
  expect(rows).toHaveLength(1);
  const counter = rows[0];
  if (!counter) throw new Error("rate_limit row missing after a sign-in attempt");
  expect(counter.count).toBe(1);

  // Another isolate consuming the same bucket is honored here even though this instance never saw
  // those attempts in process memory: the 4th call is over the sign-in limit (3 per 10 s).
  await ctx.db.update(rateLimits).set({ count: 3, lastRequest: Date.now() }).where(eq(rateLimits.key, counter.key));
  expect((await signIn(auth, ip)).status).toBe(429);
});
