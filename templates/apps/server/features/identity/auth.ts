import { betterAuth } from "better-auth";
// @erp:organizations
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "../../config/index.ts";
import type { Database } from "../../database/index.ts";
import { rateLimits } from "../../database/rate-limit.ts";
import { uuidv7 } from "../../database/uuidv7.ts";
import { recordAudit, snapshot } from "../audit/index.ts";
import { accounts, sessions, users, verifications } from "./schema.ts";

/**
 * Core Better Auth tables. The organizations installer is anchored on the `// @erp:organizations`
 * marker above and on the literal `schema:` line below, so that line stays intact; the adapter
 * call merges the rate-limit store into this map instead of editing the anchor.
 */
const coreAuthAdapter = {
  provider: "pg",
  schema: { user: users, session: sessions, account: accounts, verification: verifications },
} as const;

/** Better Auth instance; split out so CLI/tests can use it without a server. */
export function createAuth(env: Env, db: Database) {
  const googleEnabled = env.GOOGLE_CLIENT_ID !== "" && env.GOOGLE_CLIENT_SECRET !== "";

  return betterAuth({
    // Aligned with API_PREFIX so one API never carries two different prefixes.
    // The library default is `/api/auth`.
    basePath: "/api/v1/auth",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.AUTH_TRUSTED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter((o) => o !== ""),
    database: drizzleAdapter(db, {
      ...coreAuthAdapter,
      schema: { ...coreAuthAdapter.schema, rateLimit: rateLimits },
    }),
    // A user created by Better Auth (self sign-up or a plugin) leaves an audit trail too;
    // the admin create path records its own event, so this hook never double-writes.
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await recordAudit(db, {
              actorId: null,
              actorLabel: "self-sign-up",
              event: "user.created",
              subjectType: "user",
              subjectId: user.id,
              after: snapshot("user", user as unknown as Record<string, unknown>),
            });
          },
        },
      },
    },
    rateLimit: {
      // On everywhere by default; Better Auth keeps stricter built-in rules for sign-in/sign-up.
      enabled: env.AUTH_RATE_LIMIT_ENABLED,
      window: 60,
      max: 100,
      // Shared store (migration 0011): a limit consumed by one isolate or replica is visible to
      // every other one. The in-memory default is per process and bypassable across replicas.
      storage: "database",
    },
    advanced: {
      database: { generateId: () => uuidv7() },
      // TRUST_PROXY declares that a reverse proxy sets `x-forwarded-for`. Without it the header
      // is not read, so a client cannot pick its own rate-limit bucket by spoofing it.
      ipAddress: env.TRUST_PROXY ? { ipAddressHeaders: ["x-forwarded-for"] } : { ipAddressHeaders: [] },
    },
    emailAndPassword: {
      enabled: true,
      // Public self sign-up is opt-in; accounts normally come from `bun erp user:create`.
      disableSignUp: !env.AUTH_SIGNUP_ENABLED,
      minPasswordLength: 10,
      // Email password reset does not exist yet; the transport is the opt-in mail feature.
      // Leaving it on would hand users a button that never sends anything.
      sendResetPassword: undefined,
    },
    // Google OAuth dormant: the provider registers only when both of its env vars are set.
    ...(googleEnabled
      ? {
          socialProviders: {
            google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
          },
        }
      : {}),
  });
}

export type Auth = ReturnType<typeof createAuth>;
