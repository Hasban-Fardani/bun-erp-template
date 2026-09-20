import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "../../platform/config/index.ts";
import type { Database } from "../../platform/database/index.ts";
import { resolveDefaultOrganizationId } from "../../platform/database/organizations.ts";
import { accounts, sessions, users, verifications } from "./data.ts";

/**
 * Instance Better Auth (ADR-0009). Dipisah dari route supaya CLI dan test bisa memakainya
 * tanpa menyalakan server.
 *
 * Tiga hal yang mudah salah dan sengaja dikunci di sini:
 *
 * 1. Adapter Drizzle butuh OBJEK SCHEMA, bukan hanya koneksi. Tanpa itu library menolak
 *    jalan dengan "Drizzle schema mismatch" — dan mematikan pemeriksaannya
 *    (`validateSchema: false`) hanya menyembunyikan masalah, bukan menyelesaikannya.
 * 2. Nama model di sini (`user`/`session`/`account`/`verification`) harus sama dengan
 *    nama tabel fisik di migrasi 0003.
 * 3. Id dibuat `Bun.randomUUIDv7()` supaya sejenis dengan primary key tabel lain.
 *    Bawaan library adalah string acak pendek, yang akan bentrok dengan kolom `uuid`.
 */
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
          /**
           * Setiap pengguna baru masuk ke organisasi default.
           *
           * Tanpa ini `organization_id` tetap NULL, dan pengguna hasil sign-up tidak
           * terlihat oleh admin organisasi mana pun — termasuk untuk memberinya role
           * pertama. Alur undangan multi-organisasi (Phase 3) akan menggantinya dengan
           * organisasi dari undangan.
           */
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
