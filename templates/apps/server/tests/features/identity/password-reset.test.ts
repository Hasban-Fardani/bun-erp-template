import { beforeEach, describe, expect, test } from "bun:test";
import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { AppContext } from "@/bootstrap/context.ts";
import { commands } from "@/cli/commands/user.ts";
import { generatePassword } from "@/cli/lib/password.ts";
import { accounts, sessions } from "@/features/identity/schema.ts";
import { createUser, resetUserPassword } from "@/features/identity/service.ts";
import { createSeededContext } from "../../support/fixtures.ts";

let ctx: AppContext;

const actor = { userId: null, traceId: "test", label: "test" } as const;
const OLD_PASSWORD = "sandi-yang-panjang";
const NEW_PASSWORD = "sandi-baru-yang-panjang";

beforeEach(async () => {
  ctx = await createSeededContext();
});

async function accountsOf(userId: string) {
  return ctx.db.select().from(accounts).where(eq(accounts.userId, userId));
}

/** Creates a user with the standard old password. */
async function createFixtureUser(email: string) {
  return createUser(ctx.db, { name: "Reset", email, password: OLD_PASSWORD }, actor);
}

/** Adds a non-credential account so tests can prove only the credential one is touched. */
async function addOAuthAccount(userId: string, accountId: string) {
  await ctx.db.insert(accounts).values({ accountId, providerId: "google", userId, password: "oauth-placeholder" });
}

/** Adds live sessions that a password change must revoke. */
async function addSessions(userId: string, tokens: string[]) {
  await ctx.db
    .insert(sessions)
    .values(tokens.map((token) => ({ token, userId, expiresAt: new Date(Date.now() + 3_600_000) })));
}

/** Runs the service reset with the standard new password. */
async function resetTo(userId: string) {
  await resetUserPassword(ctx.db, userId, NEW_PASSWORD, actor);
}

/** Reads the credential and google rows the assertions compare. */
async function accountPair(userId: string) {
  const rows = await accountsOf(userId);
  return {
    credential: rows.find((row) => row.providerId === "credential"),
    google: rows.find((row) => row.providerId === "google"),
  };
}

describe("generatePassword", () => {
  test("returns a long, unique, URL-safe secret from the platform CSPRNG", () => {
    const values = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(values.size).toBe(50);
    for (const value of values) {
      expect(value.length).toBeGreaterThanOrEqual(16);
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("resetUserPassword", () => {
  test("changes only the credential account", async () => {
    const user = await createFixtureUser("reset@example.test");
    await addOAuthAccount(user.id, "google-reset");

    await resetTo(user.id);

    const { credential, google } = await accountPair(user.id);
    expect(credential?.password).toBeDefined();
    expect(await verifyPassword({ hash: credential?.password as string, password: NEW_PASSWORD })).toBe(true);
    expect(google?.password).toBe("oauth-placeholder");
  });

  test("revokes every session", async () => {
    const user = await createFixtureUser("reset-sessions@example.test");
    await addSessions(user.id, ["reset-token-1", "reset-token-2"]);

    await resetTo(user.id);

    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([]);
  });

  test("creates a credential account for an OAuth-only user", async () => {
    const user = await createFixtureUser("reset-oauth@example.test");
    await ctx.db.delete(accounts).where(eq(accounts.userId, user.id));

    await resetTo(user.id);

    const rows = await accountsOf(user.id);
    expect(rows.filter((row) => row.providerId === "credential")).toHaveLength(1);
  });
});

describe("user:passwd CLI", () => {
  test("rotates the credential only, revokes sessions, and prints a strong password", async () => {
    const user = await createFixtureUser("cli-passwd@example.test");
    await addOAuthAccount(user.id, "google-cli");
    await addSessions(user.id, ["cli-session"]);

    const command = commands.find((entry) => entry.name === "user:passwd");
    if (!command) throw new Error("user:passwd command missing");

    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const originalWrite = process.stdout.write;
    let output = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    }) as typeof process.stdout.write;
    try {
      await command.run(["cli-passwd@example.test"]);
    } finally {
      process.stdout.write = originalWrite;
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }

    const password = /New password: (.+)/.exec(output)?.[1];
    expect(password).toBeDefined();
    expect((password as string).length).toBeGreaterThanOrEqual(16);

    const { credential, google } = await accountPair(user.id);
    expect(await verifyPassword({ hash: credential?.password as string, password: password as string })).toBe(true);
    expect(google?.password).toBe("oauth-placeholder");
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([]);
  });
});
