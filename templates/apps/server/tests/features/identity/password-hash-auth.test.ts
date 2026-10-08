import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { AppContext } from "@/bootstrap/context.ts";
import { createAuth } from "@/features/identity/auth.ts";
import { passwordHasherFor } from "@/features/identity/password.ts";
import { accounts } from "@/features/identity/schema.ts";
import { createUser, resetUserPassword } from "@/features/identity/service.ts";
import { createSeededContext, testEnv } from "../../support/fixtures.ts";

let ctx: AppContext;

beforeEach(async () => {
  ctx = await createSeededContext();
});

const PASSWORD = "sandi-yang-panjang";
const actor = { userId: null, traceId: "test", label: "test" } as const;
const url = (path: string) => `${testEnv.BETTER_AUTH_URL}/api/v1/auth${path}`;
const post = (path: string, body: unknown) =>
  new Request(url(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function storedHash(userId: string): Promise<string> {
  const rows = await ctx.db.select().from(accounts).where(eq(accounts.userId, userId));
  return rows[0]?.password as string;
}

describe.each(["pbkdf2", "scrypt"] as const)("sign-up, sign-in and reset under PASSWORD_HASH=%s", (algorithm) => {
  const env = () => ({
    ...testEnv,
    AUTH_SIGNUP_ENABLED: true,
    PASSWORD_HASH: algorithm,
    PASSWORD_HASH_ITERATIONS: 2000,
  });

  test("sign-up stores the configured format and sign-in verifies it", async () => {
    const auth = createAuth(env(), ctx.db);
    const email = `signup-${algorithm}@example.test`;
    const up = await auth.handler(post("/sign-up/email", { email, password: PASSWORD, name: "Baru" }));
    expect(up.status).toBe(200);
    const { user } = (await up.json()) as { user: { id: string } };
    const hash = await storedHash(user.id);
    expect(hash.startsWith("pbkdf2-sha256$2000$")).toBe(algorithm === "pbkdf2");

    expect((await auth.handler(post("/sign-in/email", { email, password: PASSWORD }))).status).toBe(200);
    expect((await auth.handler(post("/sign-in/email", { email, password: `${PASSWORD}x` }))).status).toBe(401);
  });

  test("CLI/service-created users and resets use the configured hasher", async () => {
    const hasher = passwordHasherFor(env());
    const email = `service-${algorithm}@example.test`;
    const user = await createUser(ctx.db, { name: "S", email, password: PASSWORD }, actor, hasher.hash);
    const auth = createAuth(env(), ctx.db);
    expect((await auth.handler(post("/sign-in/email", { email, password: PASSWORD }))).status).toBe(200);

    await resetUserPassword(ctx.db, user.id, "sandi-baru-panjang", actor, hasher.hash);
    expect((await auth.handler(post("/sign-in/email", { email, password: PASSWORD }))).status).toBe(401);
    expect((await auth.handler(post("/sign-in/email", { email, password: "sandi-baru-panjang" }))).status).toBe(200);
  });
});

test("switching algorithms keeps existing accounts signing in, both directions", async () => {
  const scryptEnv = { ...testEnv, PASSWORD_HASH: "scrypt" as const };
  const pbkdf2Env = { ...testEnv, PASSWORD_HASH: "pbkdf2" as const, PASSWORD_HASH_ITERATIONS: 2000 };
  const email = "switch@example.test";
  const old = await createUser(
    ctx.db,
    { name: "W", email, password: PASSWORD },
    actor,
    passwordHasherFor(scryptEnv).hash,
  );
  expect((await storedHash(old.id)).startsWith("pbkdf2-sha256$")).toBe(false);
  const signIn = (env: typeof scryptEnv | typeof pbkdf2Env) =>
    createAuth(env, ctx.db).handler(post("/sign-in/email", { email, password: PASSWORD }));
  expect((await signIn(pbkdf2Env)).status).toBe(200);

  await resetUserPassword(ctx.db, old.id, PASSWORD, actor, passwordHasherFor(pbkdf2Env).hash);
  expect((await storedHash(old.id)).startsWith("pbkdf2-sha256$2000$")).toBe(true);
  expect((await signIn(scryptEnv)).status).toBe(200);
});
