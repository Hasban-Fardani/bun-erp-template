import * as z from "zod";

/**
 * Schema final dikompilasi sekali saat module di-load (aturan PRD §5).
 * Compile setelah semua refine selesai terpasang — jangan di handler.
 */

const boolOr = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true");

const timezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "must be a valid IANA timezone" },
);

const rawSchema = z
  .strictObject({
    // Application
    APP_NAME: z.string().trim().min(1).max(120),
    APP_ENV: z.enum(["development", "test", "production"]),
    APP_URL: z.url(),
    APP_PORT: z.coerce.number().int().min(1).max(65535),
    APP_RELEASE: z.string().trim().min(1).max(120),
    APP_TIMEZONE: timezone,

    // Log
    LOG_DRIVER: z.enum(["console", "daily"]),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]),
    LOG_PATH: z.string().trim().min(1),
    LOG_RETENTION_DAYS: z.coerce.number().int().positive(),
    LOG_MAX_SIZE_MB: z.coerce.number().int().positive(),
    TRUST_PROXY: boolOr("false"),

    // Database
    DATABASE_DRIVER: z.enum(["pglite", "postgres"]),
    PGLITE_PATH: z.string().trim().min(1).default(".data/pglite"),
    DATABASE_URL: z.string().trim().default(""),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_SSL_MODE: z.enum(["disable", "require", "verify-full"]).default("disable"),

    // Auth
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().default(""),
    AUTH_TRUSTED_ORIGINS: z.string().default(""),

    // Storage
    STORAGE_DRIVER: z.enum(["local", "s3"]),
    STORAGE_LOCAL_ROOT: z.string().trim().min(1).default(".data/storage"),

    // Mail
    MAIL_DRIVER: z.enum(["log", "smtp"]),
    MAIL_FROM_ADDRESS: z.string().trim().min(1),
    MAIL_FROM_NAME: z.string().trim().min(1),
    SMTP_HOST: z.string().trim().default(""),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: boolOr("false"),
    SMTP_USERNAME: z.string().trim().default(""),
    SMTP_PASSWORD: z.string().default(""),

    // Feature flags
    FEATURE_ADVANCED_REPORTS: boolOr("false"),
  })
  .superRefine((env, ctx) => {
    // Cross-field: variable yang wajib hanya pada driver/mode tertentu.
    if (env.DATABASE_DRIVER === "postgres" && env.DATABASE_URL === "") {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required when DATABASE_DRIVER=postgres" });
    }
    if (env.MAIL_DRIVER === "smtp" && env.SMTP_HOST === "") {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "required when MAIL_DRIVER=smtp" });
    }
    if (env.APP_ENV !== "production") return;

    // APP_ENV=production menolak konfigurasi tidak aman.
    if (env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "trace") {
      ctx.addIssue({ code: "custom", path: ["LOG_LEVEL"], message: "debug/trace logging is refused in production" });
    }
    if (env.STORAGE_DRIVER === "local") {
      ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "local storage is refused in production" });
    }
    if (env.BETTER_AUTH_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "must be at least 32 characters in production (run: bun erp key:generate)",
      });
    }
    if (!env.APP_URL.startsWith("https://") && !env.APP_URL.startsWith("http://localhost")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "public URL must use https in production" });
    }
    if (env.BETTER_AUTH_URL !== env.APP_URL) {
      ctx.addIssue({ code: "custom", path: ["BETTER_AUTH_URL"], message: "must equal APP_URL in production" });
    }
  });

export const EnvSchema = z.compile(rawSchema);

/** Definisi mentah diekspor untuk test parity dan pembacaan ulang key (F1.16). */
export { rawSchema as EnvRawSchema };

/** Semua key yang dikenal schema — dipakai untuk memfilter Bun.env dan melaporkan key asing. */
export const envKeys: readonly string[] = Object.freeze(
  Object.keys((rawSchema as unknown as { def: { shape: Record<string, unknown> } }).def.shape),
);

export type RawEnv = z.output<typeof EnvSchema>;

/** Key berprefiks aplikasi yang tidak dikenal schema = salah ketik / variabel mati. */
export function findStrayKeys(env: Record<string, string | undefined>): string[] {
  const prefixes = [
    "APP_",
    "LOG_",
    "DATABASE_",
    "PGLITE_",
    "BETTER_AUTH_",
    "AUTH_",
    "STORAGE_",
    "MAIL_",
    "SMTP_",
    "FEATURE_",
  ];
  return Object.keys(env)
    .filter((k) => prefixes.some((p) => k.startsWith(p)) && !envKeys.includes(k))
    .sort();
}
