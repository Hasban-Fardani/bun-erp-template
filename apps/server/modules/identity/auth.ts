import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "../../platform/config/index.ts";
import type { Database } from "../../platform/database/index.ts";
import { resolveDefaultOrganizationId } from "../../platform/database/organizations.ts";
import { accounts, sessions, users, verifications } from "./data.ts";

/** Instance Better Auth; dipisah agar CLI/test bisa memakainya tanpa server. */
export function createAuth(env: Env, db: Database) {
  const googleEnabled = env.GOOGLE_CLIENT_ID !== "" && env.GOOGLE_CLIENT_SECRET !== "";

  return betterAuth({
    // Diselaraskan dengan API_PREFIX supaya tidak ada dua awalan berbeda di satu API.
    // Bawaan library adalah `/api/auth`.
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
      // Reset sandi lewat email belum ada (mail driver Phase 3). Membiarkannya menyala
      // akan memberi pengguna tombol yang tidak pernah mengirim apa pun.
      sendResetPassword: undefined,
    },
    // Google OAuth dorman: provider hanya terdaftar kalau dua env-nya terisi.
    ...(googleEnabled
      ? {
          socialProviders: {
            google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
          },
        }
      : {}),
    user: {
      additionalFields: {
        // Nama property harus sama dengan definisi tabel; pemetaan ke kolom fisik
        // dikerjakan Drizzle. Menambah fieldName lain membuat pemeriksaan skema gagal.
        organizationId: { type: "string", required: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Tanpa ini organization_id user baru NULL — tak terlihat admin mana pun.
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
