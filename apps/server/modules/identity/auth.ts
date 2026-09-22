import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "../../platform/config/index.ts";
import type { Database } from "../../platform/database/index.ts";
import { resolveDefaultOrganizationId } from "../../platform/database/organizations.ts";
import { accounts, sessions, users, verifications } from "./data.ts";

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
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    advanced: {
      database: { generateId: () => Bun.randomUUIDv7() },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      // Email password reset does not exist yet (mail driver, Phase 3). Leaving it on
      // would hand users a button that never sends anything.
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
    user: {
      additionalFields: {
        // The property name must match the table definition; mapping to physical columns
        // is Drizzle's job. Adding another fieldName makes the schema check fail.
        organizationId: { type: "string", required: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Without this the new user's organization_id is NULL — invisible to every admin.
          before: async (user) => {
            const organizationId = await resolveDefaultOrganizationId(db);
            return { data: { ...user, organizationId } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
